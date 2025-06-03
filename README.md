# US IPO Pipeline Tracker

Real-time tracker for US IPO filings using SEC EDGAR data.

## Features

- 📊 Real-time IPO filing tracking from SEC EDGAR
- 📈 Interactive charts and statistics
- 🔍 Advanced filtering and search
- 💾 Export data as CSV
- 🔄 Automatic hourly updates
- ⚡ Live updates via WebSocket

## Setup

1. Install PostgreSQL and Node.js
2. Create database: `createdb ipo_tracker`
3. Install dependencies: `npm install`
4. Configure `.env` file with your database credentials
5. Run database setup: `psql -U postgres -d ipo_tracker -f database/schema.sql`
6. Start server: `npm run dev`
7. Visit: http://localhost:3000

## Tech Stack

- Node.js + Express
- PostgreSQL
- Socket.io
- Chart.js
- SEC EDGAR RSS Feeds

## API Endpoints

- GET `/api/filings` - Get all IPO filings
- GET `/api/stats` - Get statistics for charts
- GET `/api/export` - Export data as CSV
- POST `/api/fetch-sec-data` - Manually fetch SEC data