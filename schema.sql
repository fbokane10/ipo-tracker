-- Tables for IPO tracker (SQLite)

CREATE TABLE IF NOT EXISTS filings_raw (
    cik TEXT,
    form_type TEXT,
    filing_date TEXT,
    accession_number TEXT PRIMARY KEY,
    stage TEXT
);

CREATE TABLE IF NOT EXISTS issuer_facts (
    cik TEXT,
    fiscal_year INTEGER,
    revenue REAL,
    net_income REAL,
    assets REAL,
    shares_basic REAL,
    PRIMARY KEY (cik, fiscal_year)
);

CREATE TABLE IF NOT EXISTS performance (
    ticker TEXT PRIMARY KEY,
    first_day_close REAL,
    day30_close REAL,
    first_day_pop REAL,
    day30_return REAL
);

CREATE TABLE IF NOT EXISTS macro_daily (
    series TEXT,
    date TEXT,
    value REAL,
    PRIMARY KEY (series, date)
);

-- Views for consumers
CREATE VIEW IF NOT EXISTS deals_live AS
SELECT f.cik,
       f.form_type,
       f.filing_date,
       f.stage,
       i.revenue,
       i.shares_basic
FROM filings_raw f
LEFT JOIN issuer_facts i ON f.cik = i.cik;

CREATE VIEW IF NOT EXISTS deals_history AS
SELECT * FROM filings_raw;
