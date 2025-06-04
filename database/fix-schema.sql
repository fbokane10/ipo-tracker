-- Add missing columns if they don't exist
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS employees_count INTEGER;
ALTER TABLE ipo_filings ADD COLUMN IF NOT EXISTS fiscal_year_end VARCHAR(20);

-- Check what we have
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'ipo_filings' 
ORDER BY ordinal_position;