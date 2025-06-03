// ===================================
// IPO TRACKER DASHBOARD JAVASCRIPT
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
    
    // Initialize Socket.io connection
    initializeSocket();
    
    // Load initial data
    loadFilings();
    loadStatistics();
    
    // Set up event listeners
    setupEventListeners();
    
    // Update time
    updateLastUpdateTime();
});

// Initialize Socket.io for real-time updates
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
    
    // Listen for new filings
    socket.on('new-filing', function(filing) {
        console.log('📄 New filing received:', filing);
        showToast(`New IPO filing: ${filing.company_name}`, 'info');
        
        // Add to our data and refresh
        allFilings.unshift(filing);
        applyFilters();
        updateStatistics();
    });
    
    // Listen for status updates
    socket.on('status-update', function(update) {
        console.log('📊 Status update:', update);
        
        // Update the filing in our data
        const filing = allFilings.find(f => f.id === update.id);
        if (filing) {
            filing.status = update.status;
            applyFilters();
        }
    });
}

// Update connection status indicator
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
        }
    } catch (error) {
        console.error('❌ Error loading filings:', error);
        showToast('Error loading filings', 'error');
    }
}

// Load statistics from API
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

// Set up all event listeners
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
                showToast(`Fetched ${data.count} new filings from SEC`, 'success');
                // Reload data after fetch
                setTimeout(() => {
                    loadFilings();
                    loadStatistics();
                }, 1000);
            }
        } catch (error) {
            console.error('❌ Error fetching SEC data:', error);
            showToast('Error fetching SEC data', 'error');
        } finally {
            this.disabled = false;
            this.innerHTML = '📥 Fetch SEC Data';
        }
    });
    
    // Export button
    document.getElementById('exportBtn').addEventListener('click', function() {
        window.location.href = '/api/export';
    });
    
    // Filter listeners
    document.getElementById('dateFilter').addEventListener('change', applyFilters);
    document.getElementById('statusFilter').addEventListener('change', applyFilters);
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

// Apply filters to the data
function applyFilters() {
    const dateFilter = document.getElementById('dateFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
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
        
        // Status filter
        if (statusFilter !== 'all' && filing.status !== statusFilter) return false;
        
        // Type filter
        if (typeFilter !== 'all' && filing.filing_type !== typeFilter) return false;
        
        // Search filter
        if (searchFilter && !filing.company_name.toLowerCase().includes(searchFilter)) return false;
        
        return true;
    });
    
    renderTable();
    updateFilteredCount();
}

// Render the filings table
function renderTable() {
    const tbody = document.getElementById('filingsTableBody');
    
    if (filteredFilings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading">No filings found</td></tr>';
        return;
    }
    
    tbody.innerHTML = filteredFilings.map(filing => {
        const priceRange = (filing.price_range_low && filing.price_range_high) 
            ? `$${filing.price_range_low}-$${filing.price_range_high}`
            : filing.final_price ? `$${filing.final_price}` : '-';
            
        const amount = filing.amount_to_raise 
            ? `$${formatNumber(filing.amount_to_raise)}`
            : '-';
            
        return `
            <tr>
                <td>${formatDate(filing.filing_date)}</td>
                <td><strong>${filing.company_name}</strong></td>
                <td>${filing.ticker || '-'}</td>
                <td>${filing.industry || '-'}</td>
                <td>${filing.filing_type}</td>
                <td><span class="status-badge status-${filing.status.toLowerCase()}">${filing.status}</span></td>
                <td>${priceRange}</td>
                <td>${amount}</td>
                <td><a href="${filing.sec_url}" target="_blank" class="action-link">View Filing</a></td>
            </tr>
        `;
    }).join('');
}

// Sort table by field
function sortTable(field) {
    filteredFilings.sort((a, b) => {
        let aVal = a[field];
        let bVal = b[field];
        
        // Handle dates
        if (field === 'filing_date') {
            aVal = new Date(aVal);
            bVal = new Date(bVal);
        }
        
        // Handle numbers
        if (field === 'amount_to_raise') {
            aVal = parseFloat(aVal) || 0;
            bVal = parseFloat(bVal) || 0;
        }
        
        if (aVal < bVal) return -1;
        if (aVal > bVal) return 1;
        return 0;
    });
    
    renderTable();
}

// Update statistics
function updateStatistics() {
    // Total count
    document.getElementById('totalCount').textContent = allFilings.length;
    
    // This month count
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();
    const monthCount = allFilings.filter(f => {
        const d = new Date(f.filing_date);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).length;
    document.getElementById('monthCount').textContent = monthCount;
    
    // Active count (Filed or Marketing)
    const activeCount = allFilings.filter(f => 
        f.status === 'Filed' || f.status === 'Marketing'
    ).length;
    document.getElementById('activeCount').textContent = activeCount;
    
    // Completed count (Trading)
    const completedCount = allFilings.filter(f => f.status === 'Trading').length;
    document.getElementById('completedCount').textContent = completedCount;
    
    // Update total filings in status bar
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

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}