// ===================================
// SEC EDGAR DATA FETCHER
// This file fetches IPO filings from the SEC website
// ===================================

const axios = require('axios');
const xml2js = require('xml2js');

// Main function to fetch SEC data
async function fetchSECData(pool, io) {
    console.log('\n📋 Starting SEC EDGAR data fetch...');
    
    let newFilingsCount = 0;
    
    try {
        // STEP 1: Fetch S-1 filings (US companies going public)
        console.log('🔍 Fetching S-1 filings...');
        const s1Filings = await fetchFilingType('S-1', pool, io);
        newFilingsCount += s1Filings;
        
        // STEP 2: Fetch F-1 filings (Foreign companies going public)
        console.log('🔍 Fetching F-1 filings...');
        const f1Filings = await fetchFilingType('F-1', pool, io);
        newFilingsCount += f1Filings;
        
        // STEP 3: Fetch 424B4 filings (Final pricing documents)
        console.log('🔍 Fetching 424B4 filings...');
        const pricingFilings = await fetchFilingType('424B4', pool, io);
        newFilingsCount += pricingFilings;
        
        console.log(`✅ SEC fetch complete! Found ${newFilingsCount} new filings total\n`);
        
    } catch (error) {
        console.error('❌ Error in SEC data fetch:', error.message);
    }
    
    return newFilingsCount;
}

// Function to fetch specific filing type
async function fetchFilingType(filingType, pool, io) {
    let newCount = 0;
    
    try {
        // Build the URL for SEC RSS feed
        const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=${filingType}&output=atom`;
        
        console.log(`   📡 Requesting ${filingType} filings from SEC...`);
        
        // Make the request with proper headers
        const response = await axios.get(url, {
            headers: {
                'User-Agent': process.env.SEC_USER_AGENT || 'IPO-Tracker contact@example.com',
                'Accept': 'application/atom+xml, application/xml, text/xml'
            },
            timeout: 30000 // 30 second timeout
            maxRedirects: 5,
validateStatus: function (status) {
    return status < 500; // Accept any status code less than 500
}
        });
        
        console.log(`   ✅ Received response for ${filingType}`);
        
        // Parse the XML response
        const parser = new xml2js.Parser({
            explicitArray: false,
            ignoreAttrs: false
        });
        
        const result = await parser.parseStringPromise(response.data);
        
        // Extract entries from the feed
        const entries = result.feed.entry;
        if (!entries) {
            console.log(`   ℹ️ No ${filingType} filings found`);
            return 0;
        }
        
        // Handle single entry case (XML parser quirk)
        const filingEntries = Array.isArray(entries) ? entries : [entries];
        
        console.log(`   📊 Found ${filingEntries.length} ${filingType} filings to process`);
        
        // Process each filing
        for (const entry of filingEntries) {
            try {
                const processed = await processFiling(entry, filingType, pool, io);
                if (processed) newCount++;
            } catch (error) {
                console.error(`   ⚠️ Error processing filing:`, error.message);
            }
        }
        
    } catch (error) {
        console.error(`❌ Error fetching ${filingType}:`, error.message);
    }
    
    return newCount;
}

// Function to process individual filing
async function processFiling(entry, filingType, pool, io) {
    try {
        // Extract basic information from the entry
        const title = entry.title;
        const summary = entry.summary;
        const updated = entry.updated;
        const link = entry.link?.$.href || entry.link;
        
        // Parse company name and CIK from title
        // Format is usually: "S-1 - Company Name (CIK-0001234567)"
        const titleMatch = title.match(/^[A-Z0-9-]+ - (.+?) \((.+?)\)/);
        if (!titleMatch) {
            console.log(`   ⚠️ Could not parse title: ${title}`);
            return false;
        }
        
        const companyName = titleMatch[1].trim();
        const cikMatch = titleMatch[2].match(/(\d+)/);
        const cik = cikMatch ? cikMatch[1] : null;
        
        if (!cik) {
            console.log(`   ⚠️ No CIK found for ${companyName}`);
            return false;
        }
        
        // Extract filing date
        const filingDate = new Date(updated).toISOString().split('T')[0];
        
        console.log(`   🏢 Processing: ${companyName} (CIK: ${cik})`);
        
        // Check if filing already exists
        const existingCheck = await pool.query(
            'SELECT id FROM ipo_filings WHERE cik = $1 AND filing_type = $2 AND filing_date = $3',
            [cik, filingType, filingDate]
        );
        
        if (existingCheck.rows.length > 0) {
            console.log(`   ⏭️ Already exists: ${companyName}`);
            return false;
        }
        
        // Determine initial status based on filing type
        let status = 'Filed';
        if (filingType === '424B4') {
            status = 'Priced';
        }
        
        // Insert into database
        const insertQuery = `
            INSERT INTO ipo_filings (
                company_name, cik, filing_type, filing_date, 
                sec_url, status, last_updated
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING id, company_name
        `;
        
        const result = await pool.query(insertQuery, [
            companyName,
            cik,
            filingType,
            filingDate,
            link,
            status
        ]);
        
        console.log(`   ✅ Added: ${companyName}`);
        
        // Send real-time update via Socket.io
        if (io) {
            io.emit('new-filing', {
                id: result.rows[0].id,
                company_name: companyName,
                filing_type: filingType,
                filing_date: filingDate,
                status: status
            });
        }
        
        // If this is a 424B4 (pricing) filing, update the status of related S-1/F-1
        if (filingType === '424B4') {
            await updateRelatedFilingStatus(cik, pool, io);
        }
        
        return true;
        
    } catch (error) {
        console.error('   ❌ Error processing filing:', error.message);
        return false;
    }
}

// Function to update status of related filings
async function updateRelatedFilingStatus(cik, pool, io) {
    try {
        // Find related S-1 or F-1 filings for this company
        const updateQuery = `
            UPDATE ipo_filings 
            SET status = 'Priced', 
                last_updated = NOW()
            WHERE cik = $1 
            AND filing_type IN ('S-1', 'F-1')
            AND status != 'Priced'
            RETURNING id, company_name
        `;
        
        const result = await pool.query(updateQuery, [cik]);
        
        if (result.rows.length > 0) {
            console.log(`   📈 Updated status to 'Priced' for ${result.rows[0].company_name}`);
            
            // Send real-time update
            if (io) {
                io.emit('status-update', {
                    id: result.rows[0].id,
                    status: 'Priced'
                });
            }
        }
        
    } catch (error) {
        console.error('   ❌ Error updating related filing:', error.message);
    }
}

// Function to extract financial data from filing (placeholder for future enhancement)
async function extractFinancialData(secUrl) {
    // This is a placeholder for future functionality
    // In a real implementation, you would:
    // 1. Fetch the actual filing document
    // 2. Parse the HTML/XML
    // 3. Extract financial tables
    // 4. Return structured data
    
    return {
        revenue_latest: null,
        profit_latest: null,
        price_range_low: null,
        price_range_high: null,
        shares_offered: null
    };
}

// Test function to verify SEC connection
async function testSECConnection() {
    console.log('🧪 Testing SEC EDGAR connection...');
    
    try {
        const url = 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=S-1&output=atom';
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': process.env.SEC_USER_AGENT || 'Test-Agent test@example.com'
            },
            timeout: 10000
        });
        
        if (response.status === 200) {
            console.log('✅ SEC EDGAR connection successful!');
            return true;
        }
        
    } catch (error) {
        console.error('❌ SEC EDGAR connection failed:', error.message);
        return false;
    }
}

// Export functions
module.exports = {
    fetchSECData,
    testSECConnection
};