/**
 * Main Application Logic
 * Handles UI interactions and data display
 */

// Global state
let state = {
    leads: [],
    users: [],
    classifications: [],
    currentFilter: 'all',
    isLoading: false
};

// DOM Elements
const elements = {
    // Tabs
    tabButtons: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),

    // Status
    statusIndicator: document.getElementById('statusText'),
    refreshBtn: document.getElementById('refreshBtn'),
    refreshIcon: document.getElementById('refreshIcon'),

    // Stats
    totalLeads: document.getElementById('totalLeads'),
    totalUsers: document.getElementById('totalUsers'),
    totalClassifications: document.getElementById('totalClassifications'),
    completionRate: document.getElementById('completionRate'),
    acceptableCount: document.getElementById('acceptableCount'),
    notAcceptableCount: document.getElementById('notAcceptableCount'),

    // Tables and grids
    leadsTableBody: document.getElementById('leadsTableBody'),
    usersGrid: document.getElementById('usersGrid'),
    classificationsGrid: document.getElementById('classificationsGrid'),
    recentActivity: document.getElementById('recentActivity'),

    // Search and filters
    leadsSearch: document.getElementById('leadsSearch'),
    usersSearch: document.getElementById('usersSearch'),
    filterButtons: document.querySelectorAll('.filter-btn'),

    // Modal
    modal: document.getElementById('detailModal'),
    modalBody: document.getElementById('modalBody'),
    modalClose: document.querySelector('.modal-close')
};

/**
 * Initialize the application
 */
async function init() {
    setupEventListeners();
    await loadAllData();
    checkServerHealth();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Tab navigation
    elements.tabButtons.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Refresh button
    elements.refreshBtn.addEventListener('click', async () => {
        await loadAllData();
    });

    // Search inputs
    elements.leadsSearch.addEventListener('input', (e) => {
        filterLeads(e.target.value);
    });

    elements.usersSearch.addEventListener('input', (e) => {
        filterUsers(e.target.value);
    });

    // Classification filters
    elements.filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentFilter = btn.dataset.filter;
            renderClassifications(state.classifications);
        });
    });

    // Modal close
    elements.modalClose.addEventListener('click', closeModal);
    elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) closeModal();
    });
}

/**
 * Switch between tabs
 */
function switchTab(tabName) {
    elements.tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    elements.tabContents.forEach(content => {
        content.classList.toggle('active', content.id === tabName);
    });
}

/**
 * Load all data from APIs
 */
async function loadAllData() {
    if (state.isLoading) return;

    state.isLoading = true;
    updateStatus('Loading...', false);

    // Rotate refresh icon
    elements.refreshIcon.style.animation = 'none';
    setTimeout(() => {
        elements.refreshIcon.style.animation = 'spin 1s linear infinite';
    }, 10);

    try {
        const [leadsData, usersData, classificationsData] = await Promise.all([
            API.leads.getAll(),
            API.users.getAll(),
            API.classifications.getAll()
        ]);

        state.leads = leadsData.leads || [];
        state.users = usersData.users || [];
        state.classifications = classificationsData.classifications || [];

        renderAll();
        updateStatus('Connected', true);
    } catch (error) {
        console.error('Error loading data:', error);
        updateStatus('Connection Error', false);
        showError('Failed to load data. Please ensure all servers are running.');
    } finally {
        state.isLoading = false;
        elements.refreshIcon.style.animation = 'none';
    }
}

/**
 * Render all components
 */
function renderAll() {
    updateStats();
    renderLeads(state.leads);
    renderUsers(state.users);
    renderClassifications(state.classifications);
    renderRecentActivity();
}

/**
 * Update statistics
 */
function updateStats() {
    const completeUsers = state.users.filter(u => u.isComplete).length;
    const completionPercent = state.users.length > 0
        ? Math.round((completeUsers / state.users.length) * 100)
        : 0;

    const acceptableCount = state.classifications.filter(c => c.result === 'ACCEPTABLE').length;
    const notAcceptableCount = state.classifications.filter(c => c.result === 'NOT_ACCEPTABLE').length;

    elements.totalLeads.textContent = state.leads.length;
    elements.totalUsers.textContent = state.users.length;
    elements.totalClassifications.textContent = state.classifications.length;
    elements.completionRate.textContent = `${completionPercent}%`;
    elements.acceptableCount.textContent = acceptableCount;
    elements.notAcceptableCount.textContent = notAcceptableCount;
}

/**
 * Render leads table
 */
function renderLeads(leads) {
    if (leads.length === 0) {
        elements.leadsTableBody.innerHTML = '<tr><td colspan="6" class="loading">No leads found</td></tr>';
        return;
    }

    elements.leadsTableBody.innerHTML = leads.map(lead => `
        <tr>
            <td><strong>${escapeHtml(lead.name)}</strong></td>
            <td>${escapeHtml(lead.phoneNumber)}</td>
            <td>${escapeHtml(lead.email)}</td>
            <td>${lead.source ? `<span class="badge badge-info">${escapeHtml(lead.source)}</span>` : '-'}</td>
            <td>${formatDate(lead.createdAt)}</td>
            <td>
                <button class="btn btn-sm btn-info view-lead-btn" data-phone="${escapeHtml(lead.phoneNumber)}">
                    View Details
                </button>
            </td>
        </tr>
    `).join('');

    // Attach event listeners to view buttons
    document.querySelectorAll('.view-lead-btn').forEach(btn => {
        btn.addEventListener('click', () => viewLeadDetails(btn.dataset.phone));
    });
}

/**
 * Filter leads
 */
function filterLeads(searchTerm) {
    const term = searchTerm.toLowerCase();
    const filtered = state.leads.filter(lead =>
        lead.name.toLowerCase().includes(term) ||
        lead.phoneNumber.toLowerCase().includes(term) ||
        lead.email.toLowerCase().includes(term)
    );
    renderLeads(filtered);
}

/**
 * Render users grid
 */
function renderUsers(users) {
    if (users.length === 0) {
        elements.usersGrid.innerHTML = '<p class="loading">No user data found</p>';
        return;
    }

    elements.usersGrid.innerHTML = users.map(user => {
        const completion = user.isComplete ? 100 :
            Math.round(((Object.keys(user.bioData || {}).length + Object.keys(user.geneticData || {}).length) / 10) * 100);

        return `
            <div class="user-card">
                <div class="user-card-header">
                    <div>
                        <div class="user-card-title">${escapeHtml(user.name)}</div>
                        <div class="user-card-subtitle">${escapeHtml(user.phoneNumber)}</div>
                    </div>
                    <span class="badge ${user.isComplete ? 'badge-success' : 'badge-warning'}">
                        ${user.isComplete ? 'Complete' : 'Incomplete'}
                    </span>
                </div>

                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${completion}%"></div>
                </div>

                <div class="user-card-details">
                    ${user.bioData?.age ? `<div class="detail-row"><span class="detail-label">Age:</span><span class="detail-value">${user.bioData.age}</span></div>` : ''}
                    ${user.bioData?.gender ? `<div class="detail-row"><span class="detail-label">Gender:</span><span class="detail-value">${escapeHtml(user.bioData.gender)}</span></div>` : ''}
                    ${user.geneticData?.bloodType ? `<div class="detail-row"><span class="detail-label">Blood Type:</span><span class="detail-value">${escapeHtml(user.geneticData.bloodType)}</span></div>` : ''}
                    ${!user.isComplete ? `<div class="detail-row"><span class="detail-label">Missing:</span><span class="detail-value">${user.missingFields.length} fields</span></div>` : ''}
                </div>

                <button class="btn btn-sm btn-info view-user-btn" style="margin-top: 1rem; width: 100%;"
                        data-phone="${escapeHtml(user.phoneNumber)}">
                    View Full Profile
                </button>
            </div>
        `;
    }).join('');

    // Attach event listeners to view buttons
    document.querySelectorAll('.view-user-btn').forEach(btn => {
        btn.addEventListener('click', () => viewUserDetails(btn.dataset.phone));
    });
}

/**
 * Filter users
 */
function filterUsers(searchTerm) {
    const term = searchTerm.toLowerCase();
    const filtered = state.users.filter(user =>
        user.name.toLowerCase().includes(term) ||
        user.phoneNumber.toLowerCase().includes(term)
    );
    renderUsers(filtered);
}

/**
 * Render classifications grid
 */
function renderClassifications(classifications) {
    let filtered = classifications;

    if (state.currentFilter !== 'all') {
        filtered = classifications.filter(c => c.result === state.currentFilter);
    }

    if (filtered.length === 0) {
        elements.classificationsGrid.innerHTML = '<p class="loading">No classifications found</p>';
        return;
    }

    elements.classificationsGrid.innerHTML = filtered.map(classification => {
        const isAcceptable = classification.result === 'ACCEPTABLE';

        return `
            <div class="classification-card ${isAcceptable ? 'acceptable' : 'not-acceptable'}">
                <div class="classification-header">
                    <div>
                        <div class="user-card-title">${escapeHtml(classification.userId)}</div>
                        <div class="user-card-subtitle">${escapeHtml(classification.phoneNumber)}</div>
                    </div>
                    <div style="text-align: right;">
                        <div class="classification-score ${classification.score >= 60 ? 'high' : 'low'}">
                            ${classification.score}
                        </div>
                        <span class="badge ${isAcceptable ? 'badge-success' : 'badge-danger'}">
                            ${classification.result}
                        </span>
                    </div>
                </div>

                <div class="classification-reason">
                    ${escapeHtml(classification.reason)}
                </div>

                ${classification.factors && classification.factors.length > 0 ? `
                    <div class="classification-factors">
                        ${classification.factors.map(factor => `
                            <div class="factor-item">
                                <span class="factor-icon">
                                    ${factor.impact === 'positive' ? '✅' : factor.impact === 'negative' ? '❌' : '➖'}
                                </span>
                                <span>${escapeHtml(factor.description)}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 1rem;">
                    ${formatDate(classification.createdAt)}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Render recent activity
 */
function renderRecentActivity() {
    const activities = [];

    // Add recent classifications
    state.classifications
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5)
        .forEach(c => {
            activities.push({
                type: c.result === 'ACCEPTABLE' ? 'success' : 'warning',
                message: `${c.userId} classified as ${c.result} (Score: ${c.score})`,
                time: c.createdAt
            });
        });

    if (activities.length === 0) {
        elements.recentActivity.innerHTML = '<p class="loading">No recent activity</p>';
        return;
    }

    elements.recentActivity.innerHTML = activities.map(activity => `
        <div class="activity-item ${activity.type}">
            <div>${escapeHtml(activity.message)}</div>
            <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 0.25rem;">
                ${formatDate(activity.time)}
            </div>
        </div>
    `).join('');
}

/**
 * View lead details in modal
 */
async function viewLeadDetails(phoneNumber) {
    try {
        const [leadData, userData] = await Promise.all([
            API.leads.getByPhone(phoneNumber),
            API.users.getByPhone(phoneNumber).catch(() => null)
        ]);

        let classification = null;
        if (userData && userData.found) {
            classification = state.classifications.find(c => c.phoneNumber === phoneNumber);
        }

        const modalContent = `
            <h2>${escapeHtml(leadData.lead.name)}</h2>
            <div class="user-card-details" style="margin-top: 1.5rem;">
                <div class="detail-row"><span class="detail-label">Phone:</span><span class="detail-value">${escapeHtml(leadData.lead.phoneNumber)}</span></div>
                <div class="detail-row"><span class="detail-label">Email:</span><span class="detail-value">${escapeHtml(leadData.lead.email)}</span></div>
                ${leadData.lead.source ? `<div class="detail-row"><span class="detail-label">Source:</span><span class="detail-value">${escapeHtml(leadData.lead.source)}</span></div>` : ''}
                <div class="detail-row"><span class="detail-label">Created:</span><span class="detail-value">${formatDate(leadData.lead.createdAt)}</span></div>
            </div>

            ${userData && userData.found ? `
                <h3 style="margin-top: 2rem; margin-bottom: 1rem;">Medical Data</h3>
                <div class="user-card-details">
                    ${userData.userData.bioData?.age ? `<div class="detail-row"><span class="detail-label">Age:</span><span class="detail-value">${userData.userData.bioData.age}</span></div>` : ''}
                    ${userData.userData.bioData?.gender ? `<div class="detail-row"><span class="detail-label">Gender:</span><span class="detail-value">${escapeHtml(userData.userData.bioData.gender)}</span></div>` : ''}
                    ${userData.userData.bioData?.height ? `<div class="detail-row"><span class="detail-label">Height:</span><span class="detail-value">${userData.userData.bioData.height} cm</span></div>` : ''}
                    ${userData.userData.bioData?.weight ? `<div class="detail-row"><span class="detail-label">Weight:</span><span class="detail-value">${userData.userData.bioData.weight} kg</span></div>` : ''}
                    ${userData.userData.geneticData?.bloodType ? `<div class="detail-row"><span class="detail-label">Blood Type:</span><span class="detail-value">${escapeHtml(userData.userData.geneticData.bloodType)}</span></div>` : ''}
                </div>
            ` : '<p style="margin-top: 1rem; color: var(--text-secondary);">No medical data available</p>'}

            ${classification ? `
                <h3 style="margin-top: 2rem; margin-bottom: 1rem;">Classification</h3>
                <div class="classification-card ${classification.result === 'ACCEPTABLE' ? 'acceptable' : 'not-acceptable'}">
                    <div class="classification-header">
                        <span class="badge ${classification.result === 'ACCEPTABLE' ? 'badge-success' : 'badge-danger'}">
                            ${classification.result}
                        </span>
                        <div class="classification-score ${classification.score >= 60 ? 'high' : 'low'}">
                            ${classification.score}
                        </div>
                    </div>
                    <div class="classification-reason">${escapeHtml(classification.reason)}</div>
                </div>
            ` : ''}
        `;

        showModal(modalContent);
    } catch (error) {
        console.error('Error loading lead details:', error);
        showError('Failed to load lead details');
    }
}

/**
 * View user details in modal
 */
async function viewUserDetails(phoneNumber) {
    await viewLeadDetails(phoneNumber);
}

/**
 * Show modal
 */
function showModal(content) {
    elements.modalBody.innerHTML = content;
    elements.modal.classList.add('show');
}

/**
 * Close modal
 */
function closeModal() {
    elements.modal.classList.remove('show');
}

/**
 * Update status indicator
 */
function updateStatus(text, isConnected) {
    elements.statusIndicator.textContent = text;
    const dot = elements.statusIndicator.querySelector('.status-dot');
    if (dot) {
        dot.style.backgroundColor = isConnected ? 'var(--success-color)' : 'var(--danger-color)';
    }
}

/**
 * Check server health
 */
async function checkServerHealth() {
    try {
        const health = await API.checkHealth();
        const allHealthy = health.leads && health.users && health.classifications;

        if (!allHealthy) {
            console.warn('Some servers are not responding:', health);
        }
    } catch (error) {
        console.error('Health check failed:', error);
    }
}

/**
 * Show error message
 */
function showError(message) {
    alert(message); // In production, use a nicer toast notification
}

/**
 * Utility: Format date
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Utility: Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Add spin animation for refresh icon
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
