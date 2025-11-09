// Monitoring Dashboard JavaScript
// Handles real-time data fetching and display for VAPI/VICI monitoring

const API_BASE = '';
const REFRESH_INTERVAL = 5000; // 5 seconds
let currentTab = 'live-monitor';
let currentTimeRange = 24;
let refreshTimer = null;
let currentPage = 0;
const PAGE_SIZE = 50;

// ============= INITIALIZATION =============

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initTimeRangeFilter();
  initRefreshButton();
  initPagination();
  initModal();

  // Initial load
  loadAllData();

  // Start auto-refresh
  startAutoRefresh();
});

// ============= TAB NAVIGATION =============

function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      switchTab(tabName);
    });
  });
}

function switchTab(tabName) {
  // Update buttons
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update content
  document.querySelectorAll('.tab-content').forEach((content) => {
    content.classList.toggle('active', content.id === tabName);
  });

  currentTab = tabName;
}

// ============= TIME RANGE FILTER =============

function initTimeRangeFilter() {
  const select = document.getElementById('timeRange');
  select.addEventListener('change', (e) => {
    currentTimeRange = parseInt(e.target.value);
    loadAllData();
  });
}

// ============= REFRESH CONTROLS =============

function initRefreshButton() {
  document.getElementById('refreshBtn').addEventListener('click', () => {
    loadAllData();
  });
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    loadAllData();
  }, REFRESH_INTERVAL);
}

function updateLastUpdatedTime() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString();
  document.getElementById('lastUpdated').textContent = `Last updated: ${timeStr}`;
}

// ============= DATA LOADING =============

async function loadAllData() {
  try {
    await Promise.all([
      loadDashboardMetrics(),
      loadSystemHealth(),
      loadRealtimeMetrics(),
      loadCurrentTabData(),
    ]);
    updateLastUpdatedTime();
  } catch (error) {
    console.error('Error loading data:', error);
    showError('Failed to load dashboard data');
  }
}

async function loadDashboardMetrics() {
  try {
    const response = await fetch(`${API_BASE}/api/metrics/dashboard?hours=${currentTimeRange}`);
    const data = await response.json();

    // Update top stats cards
    document.getElementById('activeCalls').textContent = data.realtime.activeCalls.length;
    document.getElementById('totalCalls').textContent = data.calls.total;
    document.getElementById('completedCalls').textContent = data.calls.completed;
    document.getElementById('avgDuration').textContent = data.calls.avgDuration;
    document.getElementById('totalCost').textContent = `$${data.calls.totalCost.toFixed(2)}`;
    document.getElementById('conversionRate').textContent = `${data.calls.conversionRate}%`;
  } catch (error) {
    console.error('Error loading dashboard metrics:', error);
  }
}

async function loadSystemHealth() {
  try {
    const response = await fetch(`${API_BASE}/api/system/health`);
    const health = await response.json();

    const healthBanner = document.getElementById('healthBanner');
    const healthIcon = document.getElementById('healthIcon');
    const healthText = document.getElementById('healthText');
    const healthMetrics = document.getElementById('healthMetrics');

    if (health.healthy) {
      healthBanner.className = 'health-banner healthy';
      healthIcon.textContent = '✅';
      healthText.textContent = 'System Healthy';
    } else {
      healthBanner.className = 'health-banner unhealthy';
      healthIcon.textContent = '⚠️';
      healthText.textContent = 'System Issues Detected';
    }

    healthMetrics.innerHTML = `
      <span>Latency: ${health.metrics.avgApiLatency}ms</span>
      <span>Slow Ops: ${health.metrics.slowOperationsCount}</span>
    `;

    if (health.issues && health.issues.length > 0) {
      const issuesHtml = health.issues.map((issue) => `<div class="health-issue">⚠️ ${issue}</div>`).join('');
      healthMetrics.innerHTML += issuesHtml;
    }
  } catch (error) {
    console.error('Error loading system health:', error);
  }
}

async function loadRealtimeMetrics() {
  try {
    const response = await fetch(`${API_BASE}/api/metrics/realtime`);
    const data = await response.json();

    document.getElementById('callsPerMinute').textContent = data.callsPerMinute.toFixed(2);

    // Update active calls list if on that tab
    if (currentTab === 'live-monitor') {
      displayActiveCalls(data.activeCalls);
    }
  } catch (error) {
    console.error('Error loading realtime metrics:', error);
  }
}

function displayActiveCalls(activeCalls) {
  const container = document.getElementById('activeCallsList');

  if (activeCalls.length === 0) {
    container.innerHTML = '<div class="empty-state">No active calls at the moment</div>';
    return;
  }

  const callsHtml = activeCalls
    .map(
      (call) => `
    <div class="active-call-card">
      <div class="call-header">
        <h3>📞 ${call.phoneNumber}</h3>
        <span class="call-duration">${formatDuration(call.duration)}</span>
      </div>
      <div class="call-details">
        <div><strong>Call ID:</strong> ${call.callId}</div>
        <div><strong>Agent:</strong> Extension ${call.agentExtension}</div>
        <div><strong>Status:</strong> <span class="badge status-${call.status.toLowerCase()}">${call.status}</span></div>
        <div><strong>Started:</strong> ${formatTimestamp(call.startTime)}</div>
      </div>
    </div>
  `
    )
    .join('');

  container.innerHTML = callsHtml;
}

async function loadCurrentTabData() {
  switch (currentTab) {
    case 'vapi-stats':
      await loadVAPIStats();
      break;
    case 'vici-stats':
      await loadVICIStats();
      break;
    case 'performance':
      await loadPerformanceStats();
      break;
    case 'errors':
      await loadErrorStats();
      break;
    case 'call-history':
      await loadCallHistory();
      break;
  }
}

async function loadVAPIStats() {
  try {
    const callsResponse = await fetch(`${API_BASE}/api/metrics/calls?hours=${currentTimeRange}`);
    const callsData = await callsResponse.json();

    // Call status distribution
    document.getElementById('livePersonCount').textContent = callsData.byStatus.livePerson;
    document.getElementById('voicemailCount').textContent = callsData.byStatus.voicemail;
    document.getElementById('deadAirCount').textContent = callsData.byStatus.deadAir;
    document.getElementById('otherStatusCount').textContent = callsData.byStatus.other;

    // Tool stats
    const toolsResponse = await fetch(`${API_BASE}/api/metrics/tools?hours=${currentTimeRange}`);
    const toolsData = await toolsResponse.json();

    const toolStatsBody = document.getElementById('toolStatsBody');
    if (toolsData.byTool.length === 0) {
      toolStatsBody.innerHTML = '<tr><td colspan="5">No tool executions in this time range</td></tr>';
    } else {
      toolStatsBody.innerHTML = toolsData.byTool
        .map(
          (tool) => `
        <tr>
          <td><strong>${tool.name}</strong></td>
          <td>${tool.totalExecutions}</td>
          <td><span class="success-rate ${tool.successRate >= 95 ? 'high' : tool.successRate >= 80 ? 'medium' : 'low'}">${tool.successRate}%</span></td>
          <td>${tool.avgDuration}ms</td>
          <td>${tool.maxDuration}ms</td>
        </tr>
      `
        )
        .join('');
    }
  } catch (error) {
    console.error('Error loading VAPI stats:', error);
  }
}

async function loadVICIStats() {
  try {
    const response = await fetch(`${API_BASE}/api/metrics/vici?hours=${currentTimeRange}`);
    const data = await response.json();

    // Disposition stats
    const dispositionBody = document.getElementById('dispositionStatsBody');
    if (data.byCode.length === 0) {
      dispositionBody.innerHTML = '<tr><td colspan="5">No dispositions in this time range</td></tr>';
    } else {
      const total = data.totalDispositions;
      dispositionBody.innerHTML = data.byCode
        .map(
          (disp) => `
        <tr>
          <td><strong>${disp.code}</strong></td>
          <td>${disp.count}</td>
          <td>${disp.avgDuration}s</td>
          <td>${disp.avgScore}</td>
          <td>${((disp.count / total) * 100).toFixed(1)}%</td>
        </tr>
      `
        )
        .join('');
    }

    // Agent performance
    const agentBody = document.getElementById('agentStatsBody');
    if (data.agentPerformance.length === 0) {
      agentBody.innerHTML = '<tr><td colspan="5">No agent activity in this time range</td></tr>';
    } else {
      agentBody.innerHTML = data.agentPerformance
        .map(
          (agent) => `
        <tr>
          <td><strong>${agent.agentId}</strong></td>
          <td>${agent.calls}</td>
          <td>${agent.sales}</td>
          <td><span class="success-rate ${agent.conversionRate >= 50 ? 'high' : agent.conversionRate >= 30 ? 'medium' : 'low'}">${agent.conversionRate}%</span></td>
          <td>${agent.avgDuration}s</td>
        </tr>
      `
        )
        .join('');
    }

    // Pending callbacks
    document.getElementById('pendingCallbacksCount').textContent = data.pendingCallbacks;
  } catch (error) {
    console.error('Error loading VICI stats:', error);
  }
}

async function loadPerformanceStats() {
  try {
    const response = await fetch(`${API_BASE}/api/metrics/performance?hours=${currentTimeRange}`);
    const data = await response.json();

    // Performance stats table
    const perfBody = document.getElementById('perfStatsBody');
    if (data.byType.length === 0) {
      perfBody.innerHTML = '<tr><td colspan="6">No performance data in this time range</td></tr>';
    } else {
      perfBody.innerHTML = data.byType
        .map(
          (perf) => `
        <tr>
          <td><strong>${perf.type}</strong></td>
          <td>${perf.totalRequests}</td>
          <td class="${perf.avgLatency > 2000 ? 'slow-latency' : ''}">${perf.avgLatency}</td>
          <td>${perf.minLatency} / ${perf.maxLatency}</td>
          <td class="${perf.p95Latency > 3000 ? 'slow-latency' : ''}">${perf.p95Latency}</td>
          <td><span class="success-rate ${perf.successRate >= 95 ? 'high' : perf.successRate >= 80 ? 'medium' : 'low'}">${perf.successRate}%</span></td>
        </tr>
      `
        )
        .join('');
    }

    // Slow operations
    const slowOpsBody = document.getElementById('slowOpsBody');
    if (data.slowOperations.length === 0) {
      slowOpsBody.innerHTML = '<tr><td colspan="4">No slow operations detected 🎉</td></tr>';
    } else {
      slowOpsBody.innerHTML = data.slowOperations
        .map(
          (op) => `
        <tr>
          <td>${op.callId}</td>
          <td>${op.operation}</td>
          <td class="slow-latency">${op.duration}ms</td>
          <td>${formatTimestamp(op.timestamp)}</td>
        </tr>
      `
        )
        .join('');
    }
  } catch (error) {
    console.error('Error loading performance stats:', error);
  }
}

async function loadErrorStats() {
  try {
    const response = await fetch(`${API_BASE}/api/metrics/errors?hours=${currentTimeRange}`);
    const data = await response.json();

    // Error summary
    document.getElementById('totalErrors').textContent = data.total;
    document.getElementById('errorRate').textContent = `${data.errorRate}%`;

    // Errors by category
    const categoryBody = document.getElementById('errorCategoryBody');
    if (data.byCategory.length === 0) {
      categoryBody.innerHTML = '<tr><td colspan="5">No errors in this time range 🎉</td></tr>';
    } else {
      categoryBody.innerHTML = data.byCategory
        .map(
          (err) => `
        <tr>
          <td><strong>${err.category}</strong></td>
          <td>${err.type}</td>
          <td>${err.count}</td>
          <td>${err.retrySuccessRate}%</td>
          <td class="${err.criticalCount > 0 ? 'critical-error' : ''}">${err.criticalCount}</td>
        </tr>
      `
        )
        .join('');
    }

    // Recent errors
    const recentBody = document.getElementById('recentErrorsBody');
    if (data.recentErrors.length === 0) {
      recentBody.innerHTML = '<tr><td colspan="5">No recent errors</td></tr>';
    } else {
      recentBody.innerHTML = data.recentErrors
        .map(
          (err) => `
        <tr>
          <td>${err.id}</td>
          <td>${err.category}</td>
          <td><span class="severity-badge severity-${err.severity}">${err.severity}</span></td>
          <td class="error-message">${escapeHtml(err.message)}</td>
          <td>${formatTimestamp(err.timestamp)}</td>
        </tr>
      `
        )
        .join('');
    }
  } catch (error) {
    console.error('Error loading error stats:', error);
  }
}

async function loadCallHistory() {
  try {
    const offset = currentPage * PAGE_SIZE;
    const response = await fetch(`${API_BASE}/api/calls/history?limit=${PAGE_SIZE}&offset=${offset}`);
    const data = await response.json();

    const historyBody = document.getElementById('callHistoryBody');
    if (data.calls.length === 0) {
      historyBody.innerHTML = '<tr><td colspan="8">No calls found</td></tr>';
      document.getElementById('nextPage').disabled = true;
    } else {
      historyBody.innerHTML = data.calls
        .map(
          (call) => `
        <tr>
          <td class="mono">${call.call_id.substring(0, 8)}...</td>
          <td>${call.phone_number}</td>
          <td>${formatTimestamp(call.start_time)}</td>
          <td>${call.duration_seconds || '--'}s</td>
          <td><span class="badge status-${(call.status || '').toLowerCase()}">${call.status || 'N/A'}</span></td>
          <td>${call.end_reason || 'N/A'}</td>
          <td>${call.total_cost ? `$${call.total_cost.toFixed(2)}` : '--'}</td>
          <td><button onclick="viewCallDetails('${call.call_id}')" class="view-btn">View</button></td>
        </tr>
      `
        )
        .join('');

      document.getElementById('nextPage').disabled = data.calls.length < PAGE_SIZE;
    }

    document.getElementById('pageInfo').textContent = `Page ${currentPage + 1}`;
    document.getElementById('prevPage').disabled = currentPage === 0;
  } catch (error) {
    console.error('Error loading call history:', error);
  }
}

// ============= PAGINATION =============

function initPagination() {
  document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 0) {
      currentPage--;
      loadCallHistory();
    }
  });

  document.getElementById('nextPage').addEventListener('click', () => {
    currentPage++;
    loadCallHistory();
  });
}

// ============= MODAL =============

function initModal() {
  const modal = document.getElementById('callDetailsModal');
  const closeBtn = modal.querySelector('.close-modal');

  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });
}

async function viewCallDetails(callId) {
  const modal = document.getElementById('callDetailsModal');
  const content = document.getElementById('callDetailsContent');

  modal.style.display = 'block';
  content.innerHTML = '<p>Loading call details...</p>';

  try {
    const response = await fetch(`${API_BASE}/api/calls/${callId}`);
    const data = await response.json();

    const { call, events, toolExecutions } = data;

    content.innerHTML = `
      <div class="call-details">
        <div class="detail-section">
          <h3>Call Information</h3>
          <table class="detail-table">
            <tr><th>Call ID</th><td>${call.call_id}</td></tr>
            <tr><th>Phone Number</th><td>${call.phone_number}</td></tr>
            <tr><th>Call Type</th><td>${call.call_type}</td></tr>
            <tr><th>Start Time</th><td>${formatTimestamp(call.start_time)}</td></tr>
            <tr><th>End Time</th><td>${call.end_time ? formatTimestamp(call.end_time) : 'N/A'}</td></tr>
            <tr><th>Duration</th><td>${call.duration_seconds || '--'}s</td></tr>
            <tr><th>Status</th><td>${call.status || 'N/A'}</td></tr>
            <tr><th>End Reason</th><td>${call.end_reason || 'N/A'}</td></tr>
            <tr><th>Agent Extension</th><td>${call.agent_extension || 'N/A'}</td></tr>
            <tr><th>Total Cost</th><td>${call.total_cost ? `$${call.total_cost.toFixed(2)}` : '--'}</td></tr>
          </table>
        </div>

        <div class="detail-section">
          <h3>Tool Executions (${toolExecutions.length})</h3>
          <ul class="tool-execution-list">
            ${toolExecutions
              .map(
                (tool) => `
              <li>
                <strong>${tool.tool_name}</strong> - ${tool.duration_ms || 0}ms
                <span class="badge ${tool.success ? 'success' : 'error'}">${tool.success ? 'SUCCESS' : 'FAILED'}</span>
                ${!tool.success ? `<div class="error-msg">${tool.error_message}</div>` : ''}
              </li>
            `
              )
              .join('')}
          </ul>
        </div>

        ${
          call.transcript
            ? `
        <div class="detail-section">
          <h3>Transcript</h3>
          <div class="transcript">${escapeHtml(call.transcript).replace(/\n/g, '<br>')}</div>
        </div>
        `
            : ''
        }

        ${
          call.summary
            ? `
        <div class="detail-section">
          <h3>Summary</h3>
          <p>${escapeHtml(call.summary)}</p>
        </div>
        `
            : ''
        }
      </div>
    `;
  } catch (error) {
    console.error('Error loading call details:', error);
    content.innerHTML = '<p class="error">Failed to load call details</p>';
  }
}

// ============= UTILITY FUNCTIONS =============

function formatTimestamp(timestamp) {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(message) {
  console.error(message);
  // Could add toast notification here
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (refreshTimer) clearInterval(refreshTimer);
});
