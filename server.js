// ===================================
// IPO TRACKER SERVER - FIXED VERSION
// ===================================

require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');
const cron = require('node-cron');
const axios = require('axios');
const { enrichFilingWithCompanyInfo } = require('./scrapers/sec-company-info');

const app = express();
console.log('🚀 Starting IPO Tracker server...');

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
    } else {
        console.log('✅ Database connected at:', res.rows[0].now);
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API ROUTES

// Get all filings
app.get('/api/filings', async (req, res) => {
    console.log('📡 GET /api/filings');
    
    try {
        const query = `
            SELECT 
                id, company_name, ticker, industry, filing_type,
                filing_date, status, revenue_latest, profit_latest, 
                sec_url, shares_outstanding, employees_count
            FROM ipo_filings
            WHERE filing_type IN ('S-1', 'F-1')
            ORDER BY filing_date DESC
            LIMIT 200
        `;
        
        const result = await pool.query(query);
        console.log(`✅ Found ${result.rows.length} filings`);
        
        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
    console.log('📡 GET /api/stats');
    
    try {
        const monthlyQuery = `
            SELECT 
                TO_CHAR(filing_date, 'YYYY-MM') as month,
                COUNT(*) as count
            FROM ipo_filings
            WHERE filing_date >= CURRENT_DATE - INTERVAL '12 months'
            AND filing_type IN ('S-1', 'F-1')
            GROUP BY TO_CHAR(filing_date, 'YYYY-MM')
            ORDER BY month
        `;
        
        const industryQuery = `
            SELECT 
                COALESCE(industry, 'Unknown') as industry,
                COUNT(*) as count
            FROM ipo_filings
            WHERE filing_type IN ('S-1', 'F-1')
            GROUP BY industry
            ORDER BY count DESC
            LIMIT 10
        `;
        
        const [monthlyResult, industryResult] = await Promise.all([
            pool.query(monthlyQuery),
            pool.query(industryQuery)
        ]);
        
        res.json({
            success: true,
            data: {
                monthly: monthlyResult.rows,
                industry: industryResult.rows
            }
        });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Manual SEC fetch
app.post('/api/fetch-sec-data', async (req, res) => {
    console.log('📡 POST /api/fetch-sec-data - Manual trigger');
    
    try {
        const { fetchSECData } = require('./scrapers/sec-edgar');
        const newFilings = await fetchSECData(pool, io);
        
        res.json({
            success: true,
            message: `Fetched ${newFilings} new filings from SEC`,
            count: newFilings
        });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Enrich with SEC data
app.post('/api/enrich-filings', async (req, res) => {
    console.log('📡 POST /api/enrich-filings - Getting real SEC data');
    
    try {
        const filings = await pool.query(
            `SELECT id, cik, company_name 
             FROM ipo_filings 
             WHERE filing_type IN ('S-1', 'F-1')
             AND (revenue_latest IS NULL OR employees_count IS NULL)
             LIMIT 20`
        );
        
        let enrichedCount = 0;
        
        for (const filing of filings.rows) {
            try {
                const cikPadded = String(filing.cik).padStart(10, '0');
                const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cikPadded}.json`;
                
                console.log(`   🏢 Fetching data for ${filing.company_name}...`);
                
                const response = await axios.get(url, {
                    headers: {
                        'User-Agent': process.env.SEC_USER_AGENT || 'IPO-Tracker contact@example.com',
                        'Accept': 'application/json'
                    },
                    timeout: 10000
                });
                
                const data = response.data;
                let revenue = null;
                let netIncome = null;
                let employees = null;
                
                // Extract revenue
                if (data.facts && data.facts['us-gaap']) {
                    const revenueFields = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'];
                    for (const field of revenueFields) {
                        if (data.facts['us-gaap'][field]) {
                            const revData = data.facts['us-gaap'][field]['units']['USD'];
                            if (revData && revData.length > 0) {
                                revenue = revData[revData.length - 1].val;
                                break;
                            }
                        }
                    }
                    
                    // Extract net income
                    const incomeFields = ['NetIncomeLoss', 'ProfitLoss'];
                    for (const field of incomeFields) {
                        if (data.facts['us-gaap'][field]) {
                            const incData = data.facts['us-gaap'][field]['units']['USD'];
                            if (incData && incData.length > 0) {
                                netIncome = incData[incData.length - 1].val;
                                break;
                            }
                        }
                    }
                }
                
                // Extract employees
                if (data.facts && data.facts['dei'] && data.facts['dei']['EntityNumberOfEmployees']) {
                    const empData = data.facts['dei']['EntityNumberOfEmployees']['units']['pure'];
                    if (empData && empData.length > 0) {
                        employees = empData[empData.length - 1].val;
                    }
                }
                
                await pool.query(
                    `UPDATE ipo_filings 
                     SET revenue_latest = COALESCE($1, revenue_latest),
                         profit_latest = COALESCE($2, profit_latest),
                         employees_count = COALESCE($3, employees_count),
                         last_updated = NOW()
                     WHERE id = $4`,
                    [revenue, netIncome, employees, filing.id]
                );
                
                enrichedCount++;
                console.log(`   ✅ Enriched ${filing.company_name}`);
                
            } catch (error) {
                if (error.response && error.response.status === 404) {
                    console.log(`   ℹ️ No data available for ${filing.company_name}`);
                } else {
                    console.log(`   ⚠️ Error enriching ${filing.company_name}: ${error.message}`);
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        res.json({
            success: true,
            message: `Enriched ${enrichedCount} filings with SEC data`,
            count: enrichedCount
        });
        
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Export CSV
app.get('/api/export', async (req, res) => {
    try {
        const query = `
            SELECT 
                company_name, ticker, filing_type, filing_date, 
                status, revenue_latest, profit_latest, employees_count, 
                shares_outstanding, sec_url
            FROM ipo_filings
            WHERE filing_type IN ('S-1', 'F-1')
            ORDER BY filing_date DESC
        `;
        
        const result = await pool.query(query);
        
        const headers = [
            'Company Name', 'Ticker', 'Filing Type', 'Filing Date',
            'Status', 'Revenue', 'Profit', 'Employees', 'Shares', 'SEC URL'
        ];
        
        let csv = headers.join(',') + '\n';
        
        result.rows.forEach(row => {
            const values = [
                row.company_name,
                row.ticker || '',
                row.filing_type,
                row.filing_date,
                row.status,
                row.revenue_latest || '',
                row.profit_latest || '',
                row.employees_count || '',
                row.shares_outstanding || '',
                row.sec_url
            ];
            
            const escapedValues = values.map(val => {
                const str = String(val);
                if (str.includes(',') || str.includes('"')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            });
            
            csv += escapedValues.join(',') + '\n';
        });
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=ipo_filings.csv');
        res.send(csv);
    } catch (error) {
        console.error('❌ Error exporting:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date()
    });
});

// Test route
app.get('/test', (req, res) => {
    res.json({
        message: 'Server is working!',
        timestamp: new Date()
    });
});

// Create HTTP server with Socket.io
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
    });
});

// Hourly job to fetch and enrich data (disabled during tests)
if (process.env.NODE_ENV !== 'test') {
    cron.schedule('0 * * * *', async () => {
        console.log('⏰ Running scheduled SEC update');
        const { fetchSECData } = require('./scrapers/sec-edgar');
        const newFilings = await fetchSECData(pool, io);
        console.log(`⏰ Fetched ${newFilings} new filings`);
        const filings = await pool.query(
            `SELECT id, cik, company_name FROM ipo_filings WHERE (revenue_latest IS NULL OR employees_count IS NULL) LIMIT 20`
        );
        for (const filing of filings.rows) {
            await enrichFilingWithCompanyInfo(filing, pool);
            await new Promise(r => setTimeout(r, 120));
        }
    });
}

// Start server when run directly
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log('\n========================================');
        console.log('✅ IPO Tracker Server is running!');
        console.log('========================================');
        console.log(`📍 Local URL: http://localhost:${PORT}`);
        console.log('========================================\n');
    });
}

module.exports = { app, pool, io };