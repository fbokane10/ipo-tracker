# US IPO Pipeline Tracker

Backend service that tracks new IPO filings from the SEC, enriches them with available company fundamentals and simple performance numbers, and serves the data for a front end.

## Features

- Polls SEC JSON endpoints for new S‑1/F‑1/424B4 filings
- Enriches with `companyfacts` data when available
- Caches aftermarket prices from Alpha Vantage
- Nightly macro data from FRED
- Hourly ETL job configured with cron
- Simple REST API and WebSocket updates

## Setup

1. Install Node.js and Python 3
2. `npm install` to get server dependencies
3. Copy `.env.example` to `.env` and fill your Postgres credentials
4. Create the Postgres schema: `psql -U postgres -d ipo_tracker -f database/schema.sql`
5. Run the Python schema for the ETL database: `sqlite3 ipo.sqlite < schema.sql`
6. Run the server with `npm run dev`
7. Execute `python etl.py` manually or schedule it hourly

### Scheduling

You can run the ETL with cron:

```
0 * * * * cd /path/to/ipo-tracker && /usr/bin/python3 etl.py >> etl.log 2>&1
```

Or use GitHub Actions by creating a workflow that calls `python etl.py` on a schedule.

## Environment Variables

See `.env.example` for all required variables used by the Node server.

## Data Limits

- Only public SEC, Alpha Vantage (25 calls/day) and FRED APIs are used
- No HTML scraping or paid data sources
- Many filings lack share counts so valuation fields may be `NULL`
- Alpha Vantage free tier restricts to ~12 new tickers per month

## API Endpoints

- `GET /api/filings`
- `GET /api/stats`
- `GET /api/export`
- `POST /api/fetch-sec-data` (manual trigger)
- `POST /api/enrich-filings` (manual enrich)
- `GET /api/health`
