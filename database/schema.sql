-- This file creates our database structure
-- Lines starting with -- are comments (notes for humans)

-- First, we remove any old tables if they exist
-- This is like clearing out old filing cabinets before setting up new ones
DROP TABLE IF EXISTS filing_updates CASCADE;
DROP TABLE IF EXISTS ipo_filings CASCADE;

-- Now we create our main table to store IPO information
-- Think of this like creating a spreadsheet with specific columns
CREATE TABLE ipo_filings (
    -- Every row gets a unique ID number (like a filing number)
    id SERIAL PRIMARY KEY,
    
    -- Company information columns
    company_name VARCHAR(255) NOT NULL,  -- Company name (up to 255 characters)
    ticker VARCHAR(10),                  -- Stock symbol (like AAPL, GOOGL)
    industry VARCHAR(100),               -- What industry they're in
    
    -- Filing information columns
    filing_type VARCHAR(10) NOT NULL,    -- Type of form (S-1, F-1, or 424B4)
    filing_date DATE NOT NULL,           -- When they filed
    sec_url VARCHAR(500) NOT NULL,       -- Link to the SEC filing
    cik VARCHAR(20) NOT NULL,            -- Company's ID number at SEC
    
    -- Money-related columns (DECIMAL means numbers with decimals)
    price_range_low DECIMAL(10,2),       -- Lowest price they might charge
    price_range_high DECIMAL(10,2),      -- Highest price they might charge
    final_price DECIMAL(10,2),           -- Actual price when they go public
    shares_offered BIGINT,               -- How many shares they're selling
    amount_to_raise DECIMAL(15,2),       -- Total money they want to raise
    
    -- Company performance columns
    revenue_latest DECIMAL(15,2),        -- How much money they made
    profit_latest DECIMAL(15,2),         -- Their profit (or loss)
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'Filed',  -- Where they are in the process
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- When we last updated this
    
    -- This prevents duplicate entries for the same filing
    UNIQUE(cik, filing_type, filing_date)
);

-- Create a history table to track changes
-- Like keeping a log of every time we update information
CREATE TABLE filing_updates (
    id SERIAL PRIMARY KEY,
    filing_id INTEGER REFERENCES ipo_filings(id) ON DELETE CASCADE,
    update_type VARCHAR(50),             -- What kind of update
    old_value TEXT,                      -- What it was before
    new_value TEXT,                      -- What it changed to
    update_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes (these make searching faster)
-- Like creating a table of contents for quick lookups
CREATE INDEX idx_filing_date ON ipo_filings(filing_date);
CREATE INDEX idx_status ON ipo_filings(status);
CREATE INDEX idx_company_name ON ipo_filings(company_name);
CREATE INDEX idx_cik ON ipo_filings(cik);

-- Create a view (a saved search) for recent filings
-- This makes it easy to see just the last 90 days of filings
CREATE VIEW recent_filings AS
SELECT 
    id,
    company_name,
    ticker,
    industry,
    filing_type,
    filing_date,
    status,
    price_range_low,
    price_range_high,
    final_price,
    amount_to_raise
FROM ipo_filings
WHERE filing_date >= CURRENT_DATE - INTERVAL '90 days'
ORDER BY filing_date DESC;