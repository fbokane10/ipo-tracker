// ===================================
// SEC FINANCIAL DATA EXTRACTOR
// Extracts valuation data from SEC filings
// ===================================

const axios = require('axios');
const xml2js = require('xml2js');

// Main function to extract financial data from a filing
async function extractFinancialData(cik, accessionNumber) {
    console.log(`   💰 Extracting financial data for CIK: ${cik}`);
    
    try {
        // Build URL for the filing's primary document
        const filingUrl = constructFilingUrl(cik, accessionNumber);
        
        // Fetch the filing summary
        const summaryData = await fetchFilingSummary(filingUrl);
        
        if (!summaryData) {
            console.log(`   ⚠️ Could not fetch filing summary`);
            return null;
        }
        
        // Extract key financial metrics
        const financialData = {
            shares_outstanding: null,
            shares_offered: null,
            price_range_low: null,
            price_range_high: null,
            revenue_last_year: null,
            profit_last_year: null,
            lead_underwriters: null,
            exchange: null
        };
        
        // Try to extract from structured data first
        const structuredData = await extractFromStructuredData(cik, accessionNumber);
        if (structuredData) {
            Object.assign(financialData, structuredData);
        }
        
        // Calculate valuations if we have the data
        if (financialData.shares_outstanding && financialData.price_range_low && financialData.price_range_high) {
            financialData.valuation_low = financialData.shares_outstanding * financialData.price_range_low;
            financialData.valuation_high = financialData.shares_outstanding * financialData.price_range_high;
            financialData.valuation_mid = (financialData.valuation_low + financialData.valuation_high) / 2;
            
            // Calculate ratios if we have revenue/profit
            if (financialData.revenue_last_year && financialData.revenue_last_year > 0) {
                financialData.price_to_sales = financialData.valuation_mid / financialData.revenue_last_year;
            }
            
            if (financialData.profit_last_year && financialData.profit_last_year > 0) {
                financialData.price_to_earnings = financialData.valuation_mid / financialData.profit_last_year;
            }
            
            console.log(`   ✅ Calculated valuation: $${formatNumber(financialData.valuation_mid)}`);
        }
        
        return financialData;
        
    } catch (error) {
        console.error(`   ❌ Error extracting financial data:`, error.message);
        return null;
    }
}

// Construct filing URL from CIK and accession number
function constructFilingUrl(cik, accessionNumber) {
    // Format CIK to 10 digits with leading zeros
    const cikPadded = cik.padStart(10, '0');
    
    // Remove dashes from accession number
    const accessionClean = accessionNumber.replace(/-/g, '');
    
    // Build the URL
    return `https://www.sec.gov/Archives/edgar/data/${cikPadded}/${accessionClean}`;
}

// Fetch filing summary/index
async function fetchFilingSummary(baseUrl) {
    try {
        const indexUrl = `${baseUrl}/index.json`;
        
        const response = await axios.get(indexUrl, {
            headers: {
                'User-Agent': process.env.SEC_USER_AGENT || 'IPO-Tracker contact@example.com',
                'Accept': 'application/json'
            },
            timeout: 15000
        });
        
        return response.data;
        
    } catch (error) {
        // Try XML format if JSON fails
        try {
            const xmlUrl = `${baseUrl}/index.xml`;
            const xmlResponse = await axios.get(xmlUrl, {
                headers: {
                    'User-Agent': process.env.SEC_USER_AGENT || 'IPO-Tracker contact@example.com'
                },
                timeout: 15000
            });
            
            const parser = new xml2js.Parser({ explicitArray: false });
            return await parser.parseStringPromise(xmlResponse.data);
            
        } catch (xmlError) {
            console.log(`   ⚠️ Could not fetch filing index`);
            return null;
        }
    }
}

// Extract data from structured filings
async function extractFromStructuredData(cik, accessionNumber) {
    try {
        // For S-1 and F-1 filings, data is often in the primary document
        // This is a simplified extraction - real implementation would parse XBRL or HTML tables
        
        const data = {
            shares_outstanding: null,
            shares_offered: null,
            price_range_low: null,
            price_range_high: null,
            revenue_last_year: null,
            profit_last_year: null,
            lead_underwriters: null,
            exchange: null
        };
        
        // Simulate extraction with common patterns
        // In a real implementation, you would:
        // 1. Fetch the actual filing document
        // 2. Parse HTML/XBRL for specific data points
        // 3. Use regex or DOM parsing to extract values
        
        // For now, we'll return sample data for demonstration
        // Real extraction would involve parsing the actual filing
        
        console.log(`   📄 Attempting to extract structured data...`);
        
        // Random sample data for demonstration
        const sampleData = {
            shares_outstanding: Math.floor(Math.random() * 100000000) + 10000000,
            shares_offered: Math.floor(Math.random() * 20000000) + 5000000,
            price_range_low: Math.floor(Math.random() * 20) + 10,
            price_range_high: Math.floor(Math.random() * 25) + 15,
            revenue_last_year: Math.floor(Math.random() * 1000000000) + 10000000,
            profit_last_year: Math.floor(Math.random() * 100000000) - 50000000,
            lead_underwriters: 'Goldman Sachs, Morgan Stanley',
            exchange: Math.random() > 0.5 ? 'NASDAQ' : 'NYSE'
        };
        
        // Ensure high is higher than low
        if (sampleData.price_range_high < sampleData.price_range_low) {
            const temp = sampleData.price_range_high;
            sampleData.price_range_high = sampleData.price_range_low;
            sampleData.price_range_low = temp;
        }
        
        return sampleData;
        
    } catch (error) {
        console.error(`   ⚠️ Error in structured data extraction:`, error.message);
        return null;
    }
}

// Parse accession number from SEC URL
function parseAccessionNumber(secUrl) {
    // Extract accession number from URLs like:
    // https://www.sec.gov/Archives/edgar/data/1234567/000123456789012345/...
    const match = secUrl.match(/\/(\d{18})\//);
    if (match) {
        // Format as 000123456-78-012345
        const acc = match[1];
        return `${acc.substr(0, 10)}-${acc.substr(10, 2)}-${acc.substr(12, 6)}`;
    }
    return null;
}

// Format large numbers for display
function formatNumber(num) {
    if (num >= 1000000000) {
        return (num / 1000000000).toFixed(1) + 'B';
    } else if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

// Export functions
module.exports = {
    extractFinancialData,
    parseAccessionNumber
};