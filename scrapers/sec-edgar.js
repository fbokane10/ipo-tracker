// ===================================
// SEC EDGAR DATA FETCHER - FIXED VERSION
// Handles both S-1 and S-1/A filings
// ===================================

const axios = require('axios');
const xml2js = require('xml2js');

async function fetchSECData(pool, io) {
    console.log('\n📋 Starting SEC EDGAR data fetch...');
    
    let newFilingsCount = 0;
    
    try {
        // Fetch S-1 filings
        console.log('🔍 Fetching S-1 filings...');
        const s1Filings = await fetchFilingType('S-1', pool, io);
        newFilingsCount += s1Filings;
        
        // Fetch F-1 filings
        console.log('🔍 Fetching F-1 filings...');
        const f1Filings = await fetchFilingType('F-1', pool, io);
        newFilingsCount += f1Filings;
        
        console.log(`✅ SEC fetch complete! Found ${newFilingsCount} new filings total\n`);
        
    } catch (error) {
        console.error('❌ Error in SEC data fetch:', error.message);
    }
    
    return newFilingsCount;
}

async function fetchFilingType(filingType, pool, io) {
    let newCount = 0;
    
    try {
        const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=${filingType}&output=atom`;
        
        console.log(`   📡 Requesting ${filingType} filings from SEC...`);
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': process.env.SEC_USER_AGENT || 'IPO-Tracker contact@example.com',
                'Accept': 'application/atom+xml, application/xml, text/xml'
            },
            timeout: 30000
        });
        
        console.log(`   ✅ Received response for ${filingType}`);
        
        const parser = new xml2js.Parser({
            explicitArray: false,
            ignoreAttrs: false
        });
        
        const result = await parser.parseStringPromise(response.data);
        
        const entries = result.feed.entry;
        if (!entries) {
            console.log(`   ℹ️ No ${filingType} filings found`);
            return 0;
        }
        
        const filingEntries = Array.isArray(entries) ? entries : [entries];
        console.log(`   📊 Found ${filingEntries.length} ${filingType} filings to process`);
        
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

async function processFiling(entry, filingType, pool, io) {
    try {
        const title = entry.title;
        const updated = entry.updated;
        const link = entry.link?.$.href || entry.link;
        
        // Handle both S-1 and S-1/A formats
        let companyName, cik;
        
        // Try standard format: "S-1 - Company Name (CIK-0001234567)"
        let titleMatch = title.match(/^[A-Z0-9\/-]+ - (.+?) \((.+?)\)/);
        
        if (!titleMatch) {
            // Try alternate format: "S-1/A - Company Name (0001234567) (Filer)"
            titleMatch = title.match(/^[A-Z0-9\/-]+ - (.+?) \((\d+)\)/);
        }
        
        if (!titleMatch) {
            console.log(`   ⚠️ Could not parse title: ${title}`);
            return false;
        }
        
        companyName = titleMatch[1].trim();
        
        // Extract CIK
        const cikText = titleMatch[2];
        const cikMatch = cikText.match(/(\d+)/);
        cik = cikMatch ? cikMatch[1] : null;
        
        if (!cik) {
            console.log(`   ⚠️ No CIK found for ${companyName}`);
            return false;
        }
        
        const filingDate = new Date(updated).toISOString().split('T')[0];
        
        console.log(`   🏢 Processing: ${companyName} (CIK: ${cik})`);
        
        // Check if this exact filing exists
        const existingCheck = await pool.query(
            'SELECT id FROM ipo_filings WHERE cik = $1 AND filing_date = $2',
            [cik, filingDate]
        );
        
        if (existingCheck.rows.length > 0) {
            console.log(`   ⏭️ Already exists: ${companyName}`);
            return false;
        }
        
        // Check if we have any filing for this company
        const companyCheck = await pool.query(
            'SELECT id, filing_date FROM ipo_filings WHERE cik = $1 ORDER BY filing_date DESC LIMIT 1',
            [cik]
        );
        
        if (companyCheck.rows.length > 0) {
            // Update existing filing if this is newer
            const existingDate = new Date(companyCheck.rows[0].filing_date);
            const newDate = new Date(filingDate);
            
            if (newDate > existingDate) {
                await pool.query(
                    `UPDATE ipo_filings 
                     SET filing_date = $1, sec_url = $2, last_updated = NOW()
                     WHERE id = $3`,
                    [filingDate, link, companyCheck.rows[0].id]
                );
                console.log(`   📝 Updated filing date for: ${companyName}`);
                return true;
            } else {
                console.log(`   ⏭️ Newer filing already exists for: ${companyName}`);
                return false;
            }
        }
        
        // Insert new filing
        const insertQuery = `
            INSERT INTO ipo_filings (
                company_name, cik, filing_type, filing_date, 
                sec_url, status, last_updated
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING id
        `;
        
        // Determine the actual filing type (S-1 or F-1, not S-1/A)
        const baseFilingType = filingType.replace('/A', '');
        
        const result = await pool.query(insertQuery, [
            companyName,
            cik,
            baseFilingType,
            filingDate,
            link,
            'Filed'
        ]);
        
        console.log(`   ✅ Added: ${companyName}`);
        
        if (io) {
            io.emit('new-filing', {
                id: result.rows[0].id,
                company_name: companyName,
                filing_type: baseFilingType,
                filing_date: filingDate,
                status: 'Filed'
            });
        }
        
        return true;
        
    } catch (error) {
        console.error('   ❌ Error processing filing:', error.message);
        return false;
    }
}

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

module.exports = {
    fetchSECData,
    testSECConnection
};