// ===================================
// SEC COMPANY INFO FETCHER
// Gets basic company information from SEC
// ===================================

const axios = require('axios');

// Get company information from SEC
async function getCompanyInfo(cik) {
    try {
        // Pad CIK to 10 digits
        const cikPadded = String(cik).padStart(10, '0');
        
        // Get company facts from SEC API
        const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cikPadded}.json`;
        
        console.log(`   🏢 Fetching company info for CIK ${cik}...`);
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': process.env.SEC_USER_AGENT || 'IPO-Tracker contact@example.com',
                'Accept': 'application/json'
            },
            timeout: 10000
        });
        
        const data = response.data;
        
        // Extract basic information
        const info = {
            entityName: data.entityName,
            cik: data.cik,
            fiscalYearEnd: extractFiscalYearEnd(data),
            shares: extractSharesOutstanding(data),
            revenues: extractRevenues(data),
            netIncome: extractNetIncome(data),
            assets: extractTotalAssets(data),
            employees: extractEmployeeCount(data)
        };
        
        console.log(`   ✅ Found info for ${info.entityName}`);
        
        return info;
        
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log(`   ℹ️ No company facts available for CIK ${cik}`);
        } else {
            console.log(`   ⚠️ Error fetching company info: ${error.message}`);
        }
        return null;
    }
}

// Extract fiscal year end
function extractFiscalYearEnd(data) {
    try {
        if (data.facts && data.facts['dei'] && data.facts['dei']['CurrentFiscalYearEndDate']) {
            const fyData = data.facts['dei']['CurrentFiscalYearEndDate']['units']['MMM-DD'];
            if (fyData && fyData.length > 0) {
                return fyData[0].val;
            }
        }
    } catch (e) {}
    return null;
}

// Extract shares outstanding
function extractSharesOutstanding(data) {
    try {
        // Try to find shares outstanding in different possible locations
        const paths = [
            ['dei', 'EntityCommonStockSharesOutstanding'],
            ['dei', 'CommonStockSharesOutstanding'],
            ['us-gaap', 'CommonStockSharesOutstanding']
        ];
        
        for (const path of paths) {
            const [namespace, concept] = path;
            if (data.facts && data.facts[namespace] && data.facts[namespace][concept]) {
                const shareData = data.facts[namespace][concept]['units']['shares'];
                if (shareData && shareData.length > 0) {
                    // Get the most recent value
                    const sorted = shareData.sort((a, b) => b.end.localeCompare(a.end));
                    return sorted[0].val;
                }
            }
        }
    } catch (e) {}
    return null;
}

// Extract revenues
function extractRevenues(data) {
    try {
        const paths = [
            ['us-gaap', 'Revenues'],
            ['us-gaap', 'RevenueFromContractWithCustomerExcludingAssessedTax'],
            ['us-gaap', 'SalesRevenueNet']
        ];
        
        for (const path of paths) {
            const [namespace, concept] = path;
            if (data.facts && data.facts[namespace] && data.facts[namespace][concept]) {
                const revenueData = data.facts[namespace][concept]['units']['USD'];
                if (revenueData && revenueData.length > 0) {
                    // Get annual data (not quarterly)
                    const annual = revenueData.filter(d => d.form === '10-K' || d.form === 'S-1');
                    if (annual.length > 0) {
                        const sorted = annual.sort((a, b) => b.end.localeCompare(a.end));
                        return sorted[0].val;
                    }
                }
            }
        }
    } catch (e) {}
    return null;
}

// Extract net income
function extractNetIncome(data) {
    try {
        const paths = [
            ['us-gaap', 'NetIncomeLoss'],
            ['us-gaap', 'ProfitLoss'],
            ['us-gaap', 'NetIncomeLossAvailableToCommonStockholdersBasic']
        ];
        
        for (const path of paths) {
            const [namespace, concept] = path;
            if (data.facts && data.facts[namespace] && data.facts[namespace][concept]) {
                const incomeData = data.facts[namespace][concept]['units']['USD'];
                if (incomeData && incomeData.length > 0) {
                    const annual = incomeData.filter(d => d.form === '10-K' || d.form === 'S-1');
                    if (annual.length > 0) {
                        const sorted = annual.sort((a, b) => b.end.localeCompare(a.end));
                        return sorted[0].val;
                    }
                }
            }
        }
    } catch (e) {}
    return null;
}

// Extract total assets
function extractTotalAssets(data) {
    try {
        if (data.facts && data.facts['us-gaap'] && data.facts['us-gaap']['Assets']) {
            const assetData = data.facts['us-gaap']['Assets']['units']['USD'];
            if (assetData && assetData.length > 0) {
                const sorted = assetData.sort((a, b) => b.end.localeCompare(a.end));
                return sorted[0].val;
            }
        }
    } catch (e) {}
    return null;
}

// Extract employee count
function extractEmployeeCount(data) {
    try {
        if (data.facts && data.facts['dei'] && data.facts['dei']['EntityNumberOfEmployees']) {
            const empData = data.facts['dei']['EntityNumberOfEmployees']['units']['pure'];
            if (empData && empData.length > 0) {
                const sorted = empData.sort((a, b) => b.end.localeCompare(a.end));
                return sorted[0].val;
            }
        }
    } catch (e) {}
    return null;
}

// Update filing with company info
async function enrichFilingWithCompanyInfo(filing, pool) {
    try {
        const info = await getCompanyInfo(filing.cik);
        
        if (!info) {
            return false;
        }
        
        // Update the filing with real data
        const updateQuery = `
            UPDATE ipo_filings SET
                shares_outstanding = COALESCE($1, shares_outstanding),
                revenue_latest = COALESCE($2, revenue_latest),
                profit_latest = COALESCE($3, profit_latest),
                employees_count = COALESCE($4, employees_count),
                fiscal_year_end = COALESCE($5, fiscal_year_end),
                last_updated = NOW()
            WHERE id = $6
        `;
        
        await pool.query(updateQuery, [
            info.shares,
            info.revenues,
            info.netIncome,
            info.employees,
            info.fiscalYearEnd,
            filing.id
        ]);
        
        console.log(`   💰 Updated ${filing.company_name} with real SEC data`);
        
        return true;
        
    } catch (error) {
        console.error(`   ⚠️ Error enriching filing:`, error.message);
        return false;
    }
}

module.exports = {
    getCompanyInfo,
    enrichFilingWithCompanyInfo
};