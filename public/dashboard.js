// ===================================
// IPO TRACKER DASHBOARD - COMPLETE WORKING VERSION
// ===================================

// Global variables
let allFilings = [];
let filteredFilings = [];
let socket;
let monthlyChart;
let industryChart;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing IPO Tracker Dashboard...');
    
    initializeSocket();
    loadFilings();
    loadStatistics();
    setupEventListeners();
    updateLastUpdateTime();
});

// Initialize Socket.io
function initializeSocket() {
    socket = io();
    
    socket.on('connect', function() {
        console.log('✅ Connected to server');
        updateConnectionStatus(true);
    });
    
    socket.on('disconnect', function() {
        console.log('❌ Disconnected from server');
        updateConnectionStatus(false);
    });
    
    socket.on('new-filing', function(filing) {
        console.log('📄 New filing received:', filing);
        showToast(`New IPO filing: ${filing.company_name}`, 'info');
        setTimeout(() => {
            loadFilings();
            loadStatistics();
        }, 1000);
    });
}

// Update connection status
function updateConnectionStatus(connected) {
    const indicator = document.getElementById('connectionStatus');
    if (connected) {
        indicator.textContent = '🟢 Connected';
        indicator.className = 'status-indicator connected';
    } else {
        indicator.textContent = '🔴 Disconnected';
        indicator.className = 'status-indicator disconnected';
    }
}

// Load filings from API
async function loadFilings() {
    try {
        const response = await fetch('/api/filings');
        const data = await response.json();
        
        if (data.success) {
            allFilings = data.data;
            applyFilters();
            updateStatistics();
            console.log(`✅ Loaded ${allFilings.length} filings`);
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('❌ Error loading filings:', error);
        showToast('Error loading filings: ' + error.message, 'error');
    }
}

// Load statistics
async function loadStatistics() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();
        
        if (data.success) {
            updateCharts(data.data);
        }
    } catch (error) {
        console.error('❌ Error loading statistics:', error);
    }
}

// Set up event listeners
function setupEventListeners() {
    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', function() {
        loadFilings();
        loadStatistics();
        showToast('Data refreshed', 'success');
    });
    
    // Fetch SEC data button
    document.getElementById('fetchSecBtn').addEventListener('click', async function() {
        this.disabled = true;
        this.innerHTML = '<span class="spinner"></span> Fetching...';
        
        try {
            const response = await fetch('/api/fetch-sec-data', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'}
            });
            
            const data = await response.json();
            
            if (data.success) {
                showToast(data.message, 'success');
                setTimeout(() => {
                    loadFilings();
                    loadStatistics();
                }, 2000);
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            console.error('❌ Error:', error);
            showToast('Error fetching SEC data: ' + error.message, 'error');
        } finally {
            this.disabled = false;
            this.innerHTML = '📥 Fetch SEC Data';
        }
    });
    
    // Enrich data button
    document.getElementById('enrichBtn').addEventListener('click', async function() {
        this.disabled = true;
        this.innerHTML = '<span class="spinner"></span> Enriching...';
        
        try {
            const response = await fetch('/api/enrich-filings', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'}
            });
            
            const data = await response.json();
            
            if (data.success) {
                showToast(data.message, 'success');
                setTimeout(() => {
                    loadFilings();
                }, 2000);
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            console.error('❌ Error:', error);
            showToast('Error enriching data: ' + error.message, 'error');
        } finally {
            this.disabled = false;
            this.innerHTML = '💰 Enrich Data';
        }
    });
    
    // Export button
    document.getElementById('exportBtn').addEventListener('click', function() {
        window.location.href = '/api/export';
    });
    
    // Filter listeners
    document.getElementById('dateFilter').addEventListener('change', applyFilters);
    document.getElementById('dataFilter').addEventListener('change', applyFilters);
    document.getElementById('typeFilter').addEventListener('change', applyFilters);
    document.getElementById('searchFilter').addEventListener('input', applyFilters);
    
    // Sort listeners
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', function() {
            const field = this.dataset.sort;
            sortTable(field);
        });
    });
}

// Apply filters
function applyFilters() {
    const dateFilter = document.getElementById('dateFilter').value;
    const dataFilter = document.getElementById('dataFilter').value;
    const typeFilter = document.getElementById('typeFilter').value;
    const searchFilter = document.getElementById('searchFilter').value.toLowerCase();
    
    filteredFilings = allFilings.filter(filing => {
        // Date filter
        if (dateFilter !== 'all') {
            const filingDate = new Date(filing.filing_date);
            const today = new Date();
            
            switch(dateFilter) {
                case 'today':
                    if (filingDate.toDateString() !== today.toDateString()) return false;
                    break;
                case 'week':
                    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                    if (filingDate < weekAgo) return false;
                    break;
                case 'month':
                    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
                    if (filingDate < monthAgo) return false;
                    break;
                case 'quarter':
                    const quarterAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
                    if (filingDate < quarterAgo) return false;
                    break;
            }
        }
        
        // Data filter
        if (dataFilter === 'with' && !filing.revenue_latest) return false;
        if (dataFilter === 'without' && filing.revenue_latest) return false;
        
        // Type filter
        if (typeFilter !== 'all' && filing.filing_type !== typeFilter) return false;
        
        // Search filter
        if (searchFilter && !filing.company_name.toLowerCase().includes(searchFilter)) return false;
        
        return true;
    });
    
    renderTable();
    updateFilteredCount();
}

// Render table
function renderTable() {
    const tbody = document.getElementById('filingsTableBody');
    
    if (filteredFilings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">No filings found</td></tr>';
        return;
    }
    
    tbody.innerHTML = filteredFilings.map(filing => {
        const revenue = filing.revenue_latest
            ? `$${formatNumber(filing.revenue_latest)}`
            : '-';
        
        const profit = filing.profit_latest
            ? filing.profit_latest > 0 
                ? `$${formatNumber(filing.profit_latest)}`
                : `-$${formatNumber(Math.abs(filing.profit_latest))}`
            : '-';
        
        const employees = filing.employees_count
            ? formatNumber(filing.employees_count)
            : '-';
        
        const shares = filing.shares_outstanding
            ? formatNumber(filing.shares_outstanding)
            : '-';
            
        return `
            <tr>
                <td>${formatDate(filing.filing_date)}</td>
                <td>
                    <strong>${filing.company_name}</strong>
                    ${filing.ticker ? `<br><small>Ticker: ${filing.ticker}</small>` : ''}
                </td>
                <td>${filing.filing_type}</td>
                <td>${revenue}</td>
                <td>${profit}</td>
                <td>${employees}</td>
                <td>${shares}</td>
                <td><a href="${filing.sec_url}" target="_blank" class="action-link">View SEC</a></td>
            </tr>
        `;
    }).join('');
}

// Sort table
function sortTable(field) {
    filteredFilings.sort((a, b) => {
        let aVal = a[field];
        let bVal = b[field];
        
        if (field === 'filing_date') {
            aVal = new Date(aVal);
            bVal = new Date(bVal);
        }
        
        if (aVal < bVal) return -1;
        if (aVal > bVal) return 1;
        return 0;
    });
    
    renderTable();
}

// Update statistics
function updateStatistics() {
    document.getElementById('totalCount').textContent = allFilings.length;
    
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();
    const monthCount = allFilings.filter(f => {
        const d = new Date(f.filing_date);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).length;
    document.getElementById('monthCount').textContent = monthCount;
    
    const withData = allFilings.filter(f => f.revenue_latest !== null).length;
    document.getElementById('withDataCount').textContent = withData;
    
    const missingData = allFilings.length - withData;
    document.getElementById('missingDataCount').textContent = missingData;
    
    document.getElementById('totalFilings').textContent = `Total filings: ${allFilings.length}`;
}

// Update charts
function updateCharts(data) {
    // Monthly chart
    const monthlyCtx = document.getElementById('monthlyChart').getContext('2d');
    
    if (monthlyChart) monthlyChart.destroy();
    
    monthlyChart = new Chart(monthlyCtx, {
        type: 'line',
        data: {
            labels: data.monthly.map(m => formatMonth(m.month)),
            datasets: [{
                label: 'IPO Filings',
                data: data.monthly.map(m => m.count),
                borderColor: '#5a67d8',
                backgroundColor: 'rgba(90, 103, 216, 0.1)',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
    
    // Industry chart
    const industryCtx = document.getElementById('industryChart').getContext('2d');
    
    if (industryChart) industryChart.destroy();
    
    industryChart = new Chart(industryCtx, {
        type: 'doughnut',
        data: {
            labels: data.industry.map(i => i.industry),
            datasets: [{
                data: data.industry.map(i => i.count),
                backgroundColor: [
                    '#5a67d8', '#ed8936', '#48bb78', '#38b2ac', 
                    '#f56565', '#9f7aea', '#f6ad55', '#68d391',
                    '#4299e1', '#fc8181'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right'
                }
            }
        }
    });
}

// Utility functions
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatMonth(monthStr) {
    const [year, month] = monthStr.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short'
    });
}

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

function updateFilteredCount() {
    document.getElementById('filteredCount').textContent = `(${filteredFilings.length} filings)`;
}

function updateLastUpdateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
    document.getElementById('lastUpdate').textContent = `Last update: ${timeStr}`;
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}