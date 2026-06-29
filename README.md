# MLSN Web Checker

Standalone web interface for Shopify card checking with random site and proxy support.

## Features

- Drag & drop file upload (max 50 cards)
- SAC (single) and MSAC (mass) check modes
- Random site and proxy selection from Aiven DB
- Real-time results with classification
- Beautiful dark UI

## Setup

1. Copy `.env.example` to `.env` and configure
2. `pip install -r requirements.txt`
3. `python app.py`

## Deploy

```bash
# Railway
railway up

# Docker
docker build -t mlsn-web .
docker run -p 8000:8000 mlsn-web
```

## API Endpoints

- `GET /` - Web interface
- `POST /api/check` - Check cards (JSON body)
- `POST /api/check/upload` - Check cards (file upload)
- `GET /api/sites` - List sites
- `POST /api/sites` - Add sites
- `DELETE /api/sites/<url>` - Remove site
- `GET /api/proxies` - List proxies
- `POST /api/proxies` - Add proxies
- `DELETE /api/proxies/<proxy>` - Remove proxy
- `GET /api/stats` - Get stats
