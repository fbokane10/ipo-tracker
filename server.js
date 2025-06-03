// ===================================
// IPO TRACKER SERVER
// This is the main server file that runs everything
// ===================================

// PART 1: LOAD CONFIGURATION
require('dotenv').config();

// PART 2: IMPORT ALL REQUIRED PACKAGES
const express = require('express');        // Web server framework
const http = require('http');             // HTTP server
const socketIo = require('socket.io');    // Real-time updates
const cors = require('cors');             // Allow browser connections
const path = require('path');             // File path utilities
const { Pool } = require('pg');           // PostgreSQL client
const cron = require('node-cron');        // Task scheduler

// PART 3: CREATE EXPRESS APP
const app = express();
console.log('🚀 Starting IPO Tracker server...');

// PART 4: CREATE DATABASE CONNECTION
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
    } else {
        console.log('✅ Database connected at:', res.rows[0].now);
    }
});

// PART 5: MIDDLEWARE SETUP
app.use(cors());                          // Allow cross-origin requests
app.use(express.json());                  // Parse JSON bodies
app.use(express.static('public'));        // Serve static files

// PART 6: API ROUTES

// Route 1: Get all IPO filings
app.get('/api/filings', async (req, res) => {
    console.log('📡 GET /api/filings');
    
    try {
        const query = `
            SELECT 
                id, company_name, ticker, industry, filing_type,
                filing_date, status, price_range_low, price_range_high,
                final_price, shares_offered, amount_to_raise,
                revenue_latest, profit_latest, sec_url
            FROM ipo_filings
            ORDER BY filing_date DESC
            LIMIT 100
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

// Route 2: Get statistics
app.get('/api/stats', async (req, res) => {
    console.log('📡 GET /api/stats');
    
    try {
        // Monthly filing counts
        const monthlyQuery = `
            SELECT 
                TO_CHAR(filing_date, 'YYYY-MM') as month,
                COUNT(*) as count
            FROM ipo_filings
            WHERE filing_date >= CURRENT_DATE - INTERVAL '12 months'
            GROUP BY TO_CHAR(filing_date, 'YYYY-MM')
            ORDER BY month
        `;
        
        // Industry breakdown
        const industryQuery = `
            SELECT 
                COALESCE(industry, 'Unknown') as industry,
                COUNT(*) as count
            FROM ipo_filings
            WHERE filing_date >= CURRENT_DATE - INTERVAL '12 months'
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

// Route 3: Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Route 4: Test route
app.get('/test', (req, res) => {
    console.log('Someone visited /test');
    res.json({
        message: 'Server is working!',
        timestamp: new Date()
    });
});

// Route 5: Manual SEC data fetch
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

// Route 6: Test SEC connection
app.get('/api/test-sec', async (req, res) => {
    console.log('📡 GET /api/test-sec');
    
    try {
        const { testSECConnection } = require('./scrapers/sec-edgar');
        const isConnected = await testSECConnection();
        
        res.json({
            success: true,
            connected: isConnected
        });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// PART 6.5: SCHEDULED TASKS

// Schedule automatic SEC data fetch every hour
cron.schedule('0 * * * *', async () => {
    console.log('\n⏰ Running scheduled SEC data fetch at', new Date().toLocaleString());
    
    try {
        const { fetchSECData } = require('./scrapers/sec-edgar');
        const newFilings = await fetchSECData(pool, io);
        
        console.log(`✅ Scheduled fetch complete: ${newFilings} new filings\n`);
        
        // Notify all connected clients
        if (newFilings > 0) {
            io.emit('scheduled-update', {
                message: `Found ${newFilings} new filings`,
                timestamp: new Date()
            });
        }
    } catch (error) {
        console.error('❌ Scheduled fetch error:', error.message);
    }
});

console.log('⏰ Scheduled tasks set up - will fetch SEC data every hour at :00');

// Also run a fetch on server startup (after 5 seconds)
setTimeout(async () => {
    console.log('\n🚀 Running initial SEC data fetch...');
    try {
        const { fetchSECData } = require('./scrapers/sec-edgar');
        const newFilings = await fetchSECData(pool, io);
        console.log(`✅ Initial fetch complete: ${newFilings} new filings\n`);
    } catch (error) {
        console.error('❌ Initial fetch error:', error.message);
    }
}, 5000);

// PART 7: CREATE HTTP SERVER WITH SOCKET.IO
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Handle socket connections
io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
    });
});

// PART 8: START THE SERVER
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('\n========================================');
    console.log('✅ IPO Tracker Server is running!');
    console.log('========================================');
    console.log(`📍 Local URL: http://localhost:${PORT}`);
    console.log(`🧪 Test endpoint: http://localhost:${PORT}/test`);
    console.log(`📊 API endpoints:`);
    console.log(`   - GET /api/filings (get all filings)`);
    console.log(`   - GET /api/stats (get statistics)`);
    console.log(`   - GET /api/health (health check)`);
    console.log(`   - POST /api/fetch-sec-data (fetch SEC data)`);
console.log(`   - GET /api/test-sec (test SEC connection)`);
    console.log('========================================\n');
});

// PART 9: EXPORT FOR OTHER FILES
module.exports = { app, pool, io };