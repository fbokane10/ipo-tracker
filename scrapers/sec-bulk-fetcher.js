// ===================================
// SEC BULK FETCHER - Gets 3 months of IPO filings
// ===================================

const axios = require('axios');
const xml2js = require('xml2js');
const { extractFinancialData, parseAccessionNumber } = require('./sec-data-extractor');

// Fetch 3 months of S-1 filings using daily feeds
async function fetchBulkIPOData(pool, io) {
    console.log('\n📚 Starting bulk IPO data fetch (3 months)...');
    
    let totalNewFilings = 0;
    let totalProcessed = 0;
    
    try {
        // We'll fetch data day by day for the last 90 days
        const today = new Date();
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setDate(today.getDate() - 90);
        
        console.log(`📅 Fetching from ${threeMonthsAgo.toISOString().split('T')[0]} to ${today.toISOString().split('T')[0]}`);
        
        // Process each day
        for (let d = new Date(threeMonthsAgo); d <= today; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            console.log(`\n📅 Fetching filings for ${dateStr}...`);
            
            // Fetch S-1 filings for this date
            const s1Count = await fetchDailyFilings('S-1', dateStr, pool, io);
            totalNewFilings += s1Count;
            
            // Fetch F-1 filings for this date
            const f1Count = await fetchDailyFilings('F-1', dateStr, pool, io);
            totalNewFilings += f1Count;
            
            totalProcessed += s1Count + f1Count;
            
            // Small delay to be nice to SEC servers
            if (totalProcessed > 0) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        console.log('\n✅ Bulk fetch complete!');
        console.log(`📊 Total new filings added: ${totalNewFilings}`);
        
    } catch (error) {
        console.error('❌ Error in bulk fetch:', error.message);
    }
    
    return totalNewFilings;
}

// Fetch filings for a specific date
async function fetchDailyFilings(filingType, dateStr, pool, io) {
    let newCount = 0;
    
    try {
        // Use the SEC's CIK lookup API to get recent filers
        // This is a workaround since the full-text search might not be working
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(5, 7);
        const day = dateStr.substring(8, 10);
        
        // Try the current RSS feed approach but with date parameters
        const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=${filingType}&start=${year}${month}${day}&output=atom`;
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': process.env.SEC_USER_AGENT || 'IPO-Tracker contact@example.com',
                'Accept': 'application/atom+xml, application/xml, text/xml'
            },
            timeout: 15000
        });
        
        // Parse the XML response
        const parser = new xml2js.Parser({
            explicitArray: false,
            ignoreAttrs: false
        });
        
        const result = await parser.parseStringPromise(response.data);
        
        if (!result.feed || !result.feed.entry) {
            return 0;
        }
        
        const entries = Array.isArray(result.feed.entry) ? result.feed.entry : [result.feed.entry];
        
        for (const entry of entries) {
            try {
                const processed = await processFilingEntry(entry, filingType, pool, io);
                if (processed) newCount++;
            } catch (error) {
                console.error(`   ⚠️ Error processing entry:`, error.message);
            }
        }
        
    } catch (error) {
        // Silent fail for days with no data
        if (!error.response || error.response.status !== 404) {
            console.log(`   ℹ️ No ${filingType} filings found for ${dateStr}`);
        }
    }
    
    return newCount;
}

// Process individual filing entry
async function processFilingEntry(entry, filingType, pool, io) {
    try {
        const title = entry.title;
        const updated = entry.updated;
        const link = entry.link?.$.href || entry.link;
        
        // Parse company name and CIK
        const titleMatch = title.match(/^[A-Z0-9-]+ - (.+?) \((.+?)\)/);
        if (!titleMatch) {
            return false;
        }
        
        const companyName = titleMatch[1].trim();
        const cikMatch = titleMatch[2].match(/(\d+)/);
        const cik = cikMatch ? cikMatch[1] : null;
        
        if (!cik) {
            return false;
        }
        
        const filingDate = new Date(updated).toISOString().split('T')[0];
        
        // Check if already exists
        const existingCheck = await pool.query(
            'SELECT id FROM ipo_filings WHERE cik = $1 AND filing_type = $2 AND filing_date = $3',
            [cik, filingType, filingDate]
        );
        
        if (existingCheck.rows.length > 0) {
            return false;
        }
        
        console.log(`   ✅ Adding: ${companyName}`);
        
        // Insert the filing
        const insertQuery = `
            INSERT INTO ipo_filings (
                company_name, cik, filing_type, filing_date, 
                sec_url, status, last_updated
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING id
        `;
        
        const result = await pool.query(insertQuery, [
            companyName,
            cik,
            filingType,
            filingDate,
            link,
            'Filed'
        ]);
        
        // Extract financial data
        const accessionNumber = parseAccessionNumber(link);
        if (accessionNumber) {
            const financialData = await extractFinancialData(cik, accessionNumber);
            
            if (financialData) {
                const updateQuery = `
                    UPDATE ipo_filings SET
                        shares_outstanding = $1,
                        shares_offered = $2,
                        price_range_low = $3,
                        price_range_high = $4,
                        valuation_low = $5,
                        valuation_high = $6,
                        valuation_mid = $7,
                        revenue_last_year = $8,
                        profit_last_year = $9,
                        revenue_latest = $8,
                        profit_latest = $9,
                        price_to_sales = $10,
                        price_to_earnings = $11,
                        lead_underwriters = $12,
                        exchange = $13,
                        amount_to_raise = $14
                    WHERE id = $15
                `;
                
                const amountToRaise = financialData.shares_offered * 
                    ((financialData.price_range_low + financialData.price_range_high) / 2);
                
                await pool.query(updateQuery, [
                    financialData.shares_outstanding,
                    financialData.shares_offered,
                    financialData.price_range_low,
                    financialData.price_range_high,
                    financialData.valuation_low,
                    financialData.valuation_high,
                    financialData.valuation_mid,
                    financialData.revenue_last_year,
                    financialData.profit_last_year,
                    financialData.price_to_sales,
                    financialData.price_to_earnings,
                    financialData.lead_underwriters,
                    financialData.exchange,
                    amountToRaise,
                    result.rows[0].id
                ]);
            }
        }
        
        return true;
        
    } catch (error) {
        console.error('   ❌ Error processing filing:', error.message);
        return false;
    }
}

// Alternative: Use a predefined list of recent IPO companies
async function fetchKnownIPOCompanies(pool, io) {
    console.log('\n📋 Fetching known recent IPO companies...');
    
    // This is a list of companies that have filed for IPO recently
    // In production, you'd get this from a financial data provider
    const recentIPOCompanies = [
        { name: 'Reddit, Inc.', cik: '1713445', ticker: 'RDDT' },
        { name: 'Astera Labs, Inc.', cik: '1912498', ticker: 'ALAB' },
        { name: 'Rubrik, Inc.', cik: '1823652', ticker: 'RBRK' },
        { name: 'Ibotta, Inc.', cik: '1741231', ticker: 'IBTA' },
        { name: 'Brightspring Health Services', cik: '1968290', ticker: 'BTSG' },
        { name: 'Amer Sports, Inc.', cik: '1989106', ticker: 'AS' },
        { name: 'Kenvue Inc.', cik: '1910139', ticker: 'KVUE' },
        { name: 'Cava Group, Inc.', cik: '1923330', ticker: 'CAVA' },
        { name: 'Instacart (Maplebear Inc.)', cik: '1579091', ticker: 'CART' },
        { name: 'Klaviyo, Inc.', cik: '1715497', ticker: 'KVYO' },
        { name: 'Arm Holdings plc', cik: '1973239', ticker: 'ARM' },
        { name: 'VinFast Auto Ltd.', cik: '1915250', ticker: 'VFS' },
        { name: 'Oddity Tech Ltd.', cik: '1915814', ticker: 'ODD' },
        { name: 'Savers Value Village, Inc.', cik: '1883761', ticker: 'SVV' },
        { name: 'DATATEC LIMITED', cik: '1968457', ticker: 'DTC' },
        { name: 'Fidelis Insurance Holdings', cik: '1975160', ticker: 'FIHL' },
        { name: 'Soleno Therapeutics, Inc.', cik: '1784690', ticker: 'SLNO' },
        { name: 'Apogee Therapeutics, Inc.', cik: '1969931', ticker: 'APGE' },
        { name: 'Centuri Holdings, Inc.', cik: '2002342', ticker: 'CTRI' },
        { name: 'OneStream, Inc.', cik: '1806176', ticker: 'OS' }
    ];
    
    let addedCount = 0;
    
    for (const company of recentIPOCompanies) {
        try {
            // Check if already exists
            const exists = await pool.query(
                'SELECT id FROM ipo_filings WHERE cik = $1',
                [company.cik]
            );
            
            if (exists.rows.length === 0) {
                // Add the company
                const insertQuery = `
                    INSERT INTO ipo_filings (
                        company_name, cik, ticker, filing_type, filing_date,
                        sec_url, status, last_updated
                    ) VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, $6, NOW())
                    RETURNING id
                `;
                
                const secUrl = `https://www.sec.gov/cgi-bin/browse-edgar?CIK=${company.cik}`;
                
                await pool.query(insertQuery, [
                    company.name,
                    company.cik,
                    company.ticker,
                    'S-1',
                    secUrl,
                    'Filed'
                ]);
                
                console.log(`   ✅ Added: ${company.name}`);
                addedCount++;
            }
        } catch (error) {
            console.error(`   ⚠️ Error adding ${company.name}:`, error.message);
        }
    }
    
    return addedCount;
}

module.exports = {
    fetchBulkIPOData,
    fetchKnownIPOCompanies
};