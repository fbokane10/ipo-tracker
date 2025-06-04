-- Add new columns for valuation calculations
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS shares_outstanding BIGINT;
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS valuation_low DECIMAL(15,2);
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS valuation_high DECIMAL(15,2);
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS valuation_mid DECIMAL(15,2);
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS revenue_last_year DECIMAL(15,2);
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS profit_last_year DECIMAL(15,2);
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS price_to_sales DECIMAL(10,2);
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS price_to_earnings DECIMAL(10,2);

-- Add columns for market performance tracking (for later)
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS final_shares_offered BIGINT;
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS first_day_close DECIMAL(10,2);
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS first_day_change_pct DECIMAL(8,2);
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS thirty_day_price DECIMAL(10,2);
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS thirty_day_change_pct DECIMAL(8,2);
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS trading_date DATE;

-- Add columns for additional metadata
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS lead_underwriters TEXT;
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS exchange VARCHAR(20);
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS withdrawn BOOLEAN DEFAULT FALSE;
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS withdrawn_date DATE;