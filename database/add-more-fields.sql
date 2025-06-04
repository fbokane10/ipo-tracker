-- Add more detailed fields for IPO filings
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS business_description TEXT;
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS use_of_proceeds TEXT;
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS risk_factors_summary TEXT;
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS employees_count INTEGER;
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS founded_year INTEGER;
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS headquarters_location VARCHAR(255);
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS website VARCHAR(255);
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS fiscal_year_end VARCHAR(20);
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS auditor VARCHAR(255);
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS law_firm VARCHAR(255);
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS estimated_market_cap DECIMAL(15,2);