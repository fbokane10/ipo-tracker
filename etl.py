import sqlite3
import requests
import time
import toml
from datetime import datetime, timedelta

CONFIG = toml.load('config.toml')
HEADERS = {'User-Agent': CONFIG['sec']['user_agent'], 'Accept': 'application/json'}
DB_PATH = CONFIG['database']['path']
SEC_SLEEP = CONFIG['sec'].get('sleep', 0.12)
ALPHA_KEY = CONFIG['alpha_vantage']['key']

FRED_SERIES = {
    'DGS10': 'https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=fred&file_type=json',
    'BAMLH0A0HYM2': 'https://api.stlouisfed.org/fred/series/observations?series_id=BAMLH0A0HYM2&api_key=fred&file_type=json'
}

def db():
    return sqlite3.connect(DB_PATH)

def fetch_filings(conn):
    tracked = conn.execute('SELECT DISTINCT cik FROM filings_raw').fetchall()
    for (cik,) in tracked:
        url = f'https://data.sec.gov/submissions/CIK{str(cik).zfill(10)}.json'
        r = requests.get(url, headers=HEADERS)
        if r.status_code != 200:
            continue
        j = r.json()
        recent = j.get('filings', {}).get('recent', {})
        forms = recent.get('form', [])
        dates = recent.get('filingDate', [])
        accession = recent.get('accessionNumber', [])
        for form, date, acc in zip(forms, dates, accession):
            if form not in ['S-1', 'F-1', 'S-1/A', 'F-1/A', '424B4', 'EFFECT', 'RW']:
                continue
            exists = conn.execute('SELECT 1 FROM filings_raw WHERE cik=? AND accession_number=?', (cik, acc)).fetchone()
            if exists:
                continue
            conn.execute('INSERT INTO filings_raw (cik, form_type, filing_date, accession_number, stage) VALUES (?,?,?,?,?)',
                         (cik, form, date, acc, 'Filed'))
        conn.commit()
        time.sleep(SEC_SLEEP)

def enrich_facts(conn):
    rows = conn.execute('SELECT DISTINCT cik FROM filings_raw').fetchall()
    for (cik,) in rows:
        url = f'https://data.sec.gov/api/xbrl/companyfacts/CIK{str(cik).zfill(10)}.json'
        r = requests.get(url, headers=HEADERS)
        if r.status_code != 200:
            continue
        data = r.json().get('facts', {}).get('us-gaap', {})
        rev = get_latest_value(data, ['Revenues'])
        inc = get_latest_value(data, ['NetIncomeLoss'])
        assets = get_latest_value(data, ['Assets'])
        shares = get_latest_value(data, ['WeightedAverageSharesOutstandingBasic'], unit='shares')
        year = datetime.now().year
        conn.execute('REPLACE INTO issuer_facts (cik, fiscal_year, revenue, net_income, assets, shares_basic) VALUES (?,?,?,?,?,?)',
                     (cik, year, rev, inc, assets, shares))
        conn.commit()
        time.sleep(SEC_SLEEP)

def get_latest_value(ns, fields, unit='USD'):
    for f in fields:
        if f in ns and 'units' in ns[f] and unit in ns[f]['units']:
            vals = ns[f]['units'][unit]
            if vals:
                vals.sort(key=lambda x: x.get('end', ''))
                return vals[-1]['val']
    return None

def update_macro(conn):
    for name, url in FRED_SERIES.items():
        r = requests.get(url)
        if r.status_code != 200:
            continue
        obs = r.json()['observations'][-1]
        conn.execute('INSERT OR IGNORE INTO macro_daily (series, date, value) VALUES (?,?,?)',
                     (name, obs['date'], obs['value']))
    conn.commit()

def main():
    conn = db()
    fetch_filings(conn)
    enrich_facts(conn)
    update_macro(conn)
    conn.close()

if __name__ == '__main__':
    main()
