/* ============================================================
   LeaveFlow — frontend logic
   Talks to Express backend (/api/*) with Bearer token auth.
   Real-time updates via Server-Sent Events (/api/events).
   ============================================================ */

const API = {
  token: localStorage.getItem('lf_token') || null,
  user: JSON.parse(localStorage.getItem('lf_user') || 'null'),
};

const COLORS = { Casual: '#818cf8', Sick: '#f87171', Earned: '#4ade80' };
const TYPE_ICONS = { Casual: 'CL', Sick: 'SL', Earned: 'EL' };

let charts = {};
let eventSource = null;
let allLeaves = [];

/* ---------- API helper ---------- */
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(API.token ? { Authorization: `Bearer ${API.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ---------- Toasts ---------- */
function toast(title, body = '', type = 'info', ms = 5000) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <div>
      <div class="toast-title">${title}</div>
      ${body ? `<div class="toast-body">${body}</div>` : ''}
    </div>
    <button class="toast-close">✕</button>`;
  el.querySelector('.toast-close').onclick = () => el.remove();
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/* ---------- Auth ---------- */
async function login(username, password, role) {
  const data = await api('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, role }),
  });
  API.token = data.token;
  API.user = data.user;
  localStorage.setItem('lf_token', data.token);
  localStorage.setItem('lf_user', JSON.stringify(data.user));
}

async function signup(payload) {
  return api('/api/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
async function logout() {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  API.token = null; API.user = null;
  localStorage.removeItem('lf_token');
  localStorage.removeItem('lf_user');
  if (eventSource) eventSource.close();
  showLogin();
}

/* ---------- Views ---------- */
function showLogin() {
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('app-view').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');

  document.getElementById('user-name').textContent = API.user.name;
  document.getElementById('user-role').textContent = API.user.role;
  document.getElementById('user-avatar').textContent = API.user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  document.querySelectorAll('.admin-only').forEach(el =>
    el.classList.toggle('hidden', API.user.role !== 'admin'));
  document.querySelectorAll('.employee-only').forEach(el =>
    el.classList.toggle('hidden', API.user.role !== 'employee'));

  connectSSE();
  switchView(API.user.role === 'admin' ? 'admin' : 'dashboard');
  refreshAll();
}

function switchView(view) {
  document.querySelectorAll('.nav-item').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');

  const titles = {
    dashboard: ['Dashboard', 'Overview of your leave & balances'],
    apply: ['Apply Leave', 'Submit a new time-off request'],
    history: ['My Leaves', 'All your leave requests'],
    admin: ['Admin Panel', 'Review and manage team leave requests'],
  };
  document.getElementById('page-title').textContent = titles[view][0];
  document.getElementById('page-subtitle').textContent = titles[view][1];
}

/* ---------- Data ---------- */
async function refreshAll() {
  try {
    const [leavesRes, statsRes] = await Promise.all([
      api('/api/leaves'),
      api('/api/stats'),
    ]);
    allLeaves = leavesRes.leaves;
    renderDashboard(statsRes);
    renderApplyBalances();
    renderHistory();
    if (API.user.role === 'admin') renderAdmin(statsRes);
  } catch (e) {
    if (e.message === 'Unauthorized') logout();
    else toast('Error', e.message, 'error');
  }
}

/* ---------- Dashboard ---------- */
function renderDashboard(stats) {
  const mine = allLeaves.filter(l => l.employeeId === API.user.id);
  const balances = computeBalances(mine);

  document.getElementById('balance-cards').innerHTML = Object.entries(balances).map(([type, b]) => {
    const pct = Math.round((b.used / b.total) * 100);
    const color = COLORS[type];
    return `
      <div class="stat-card">
        <div class="stat-label">${type} Leave</div>
        <div class="stat-num" style="color:${color}">${b.remaining}<span style="font-size:1rem;color:var(--muted)">/${b.total}</span></div>
        <div class="stat-sub">${b.used} days used</div>
        <div class="progress" style="margin-top:12px"><div style="width:${pct}%;background:${color}"></div></div>
      </div>`;
  }).join('');

  renderCharts(stats);
  renderRecent(mine);
}

function computeBalances(leaves) {
  const totals = { Casual: 12, Sick: 12, Earned: 15 };
  const used = { Casual: 0, Sick: 0, Earned: 0 };
  leaves.filter(l => l.status === 'approved').forEach(l => { used[l.type] = (used[l.type] || 0) + l.days; });
  return Object.fromEntries(Object.entries(totals).map(([t, total]) => [t, { total, used: used[t] || 0, remaining: total - (used[t] || 0) }]));
}

function renderCharts(stats) {
  const types = ['Casual', 'Sick', 'Earned'];
  const mine = allLeaves.filter(l => l.employeeId === API.user.id && l.status === 'approved');
  const daysByType = { Casual: 0, Sick: 0, Earned: 0 };
  mine.forEach(l => daysByType[l.type] += l.days);

  if (charts.usage) charts.usage.destroy();
  charts.usage = new Chart(document.getElementById('usage-chart'), {
    type: 'doughnut',
    data: {
      labels: types,
      datasets: [{ data: types.map(t => daysByType[t]), backgroundColor: types.map(t => COLORS[t]), borderWidth: 0 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: { legend: { position: 'bottom', labels: { color: '#8b98b8', font: { family: 'Inter' } } } },
    },
  });

  if (charts.trend) charts.trend.destroy();
  charts.trend = new Chart(document.getElementById('trend-chart'), {
    type: 'bar',
    data: {
      labels: stats.monthly.map(m => m.label),
      datasets: [{
        data: stats.monthly.map(m => m.days),
        backgroundColor: 'rgba(99,102,241,.7)',
        borderRadius: 6, borderSkipped: false,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#8b98b8' }, grid: { display: false } },
        y: { ticks: { color: '#8b98b8' }, grid: { color: 'rgba(139,152,184,.12)' }, beginAtZero: true },
      },
    },
  });
}

function leaveItemHTML(l, actionsHTML = '') {
  return `
    <div class="leave-item">
      <div class="leave-icon type-${l.type}">${TYPE_ICONS[l.type]}</div>
      <div class="leave-info">
        <div class="leave-title">${l.type} Leave · ${l.days} day${l.days > 1 ? 's' : ''}</div>
        <div class="leave-sub">${l.start} → ${l.end} · ${l.reason || ''}${l.employeeName && API.user.role === 'admin' ? ' · ' + l.employeeName : ''}</div>
      </div>
      <span class="status ${l.status}">${l.status}</span>
      ${actionsHTML}
    </div>`;
}

function renderRecent(mine) {
  const sorted = [...mine].sort((a, b) => b.appliedOn.localeCompare(a.appliedOn)).slice(0, 6);
  document.getElementById('recent-leaves').innerHTML = sorted.length
    ? `<div class="leave-list">${sorted.map(l => leaveItemHTML(l)).join('')}</div>`
    : '<p class="empty">No leave requests yet — apply for your first leave!</p>';
}

/* ---------- Apply ---------- */
function renderApplyBalances() {
  const mine = allLeaves.filter(l => l.employeeId === API.user.id);
  const balances = computeBalances(mine);
  document.getElementById('apply-balances').innerHTML = Object.entries(balances).map(([type, b]) => {
    const pct = Math.round((b.used / b.total) * 100);
    const color = COLORS[type];
    return `
      <div class="balance-row">
        <div class="bal-head"><strong>${type}</strong><span>${b.remaining} of ${b.total} days left</span></div>
        <div class="progress"><div style="width:${pct}%;background:${color}"></div></div>
      </div>`;
  }).join('');
}

document.getElementById('leave-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('apply-msg');
  msg.className = 'form-msg'; msg.textContent = '';

  const payload = {
    type: document.getElementById('f-type').value,
    days: document.getElementById('f-days').value,
    start: document.getElementById('f-start').value,
    end: document.getElementById('f-end').value,
    reason: document.getElementById('f-reason').value,
  };

  try {
    await api('/api/leaves', { method: 'POST', body: JSON.stringify(payload) });
    e.target.reset();
    document.getElementById('f-days').value = 1;
    msg.textContent = 'Request submitted!';
    msg.className = 'form-msg ok';
    toast('Leave request submitted', `${payload.type} leave · ${payload.days} day(s)`, 'success');
    refreshAll();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'form-msg err';
  }
});

/* ---------- History ---------- */
function renderHistory() {
  const filter = document.getElementById('history-filter').value;
  let mine = allLeaves.filter(l => l.employeeId === API.user.id);
  if (filter !== 'all') mine = mine.filter(l => l.status === filter);
  mine.sort((a, b) => b.appliedOn.localeCompare(a.appliedOn));

  const tbody = document.getElementById('history-body');
  document.getElementById('history-empty').classList.toggle('hidden', mine.length > 0);
  tbody.innerHTML = mine.map(l => `
    <tr>
      <td><span class="leave-icon type-${l.type}" style="display:inline-flex;width:30px;height:30px;font-size:.7rem">${TYPE_ICONS[l.type]}</span> ${l.type}</td>
      <td>${l.start} → ${l.end}</td>
      <td><strong>${l.days}</strong></td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.reason}</td>
      <td><span class="status ${l.status}">${l.status}</span></td>
      <td>${l.appliedOn}</td>
      <td>${l.status === 'pending' ? `<button class="btn btn-danger btn-sm" onclick="cancelLeave('${l.id}')">Cancel</button>` : ''}</td>
    </tr>`).join('');
}

async function cancelLeave(id) {
  try {
    await api(`/api/leaves/${id}`, { method: 'DELETE' });
    toast('Request cancelled', '', 'info');
    refreshAll();
  } catch (e) { toast('Error', e.message, 'error'); }
}

/* ---------- Admin ---------- */
function renderAdmin(stats) {
  const pending = allLeaves.filter(l => l.status === 'pending');
  const approved = allLeaves.filter(l => l.status === 'approved');
  const rejected = allLeaves.filter(l => l.status === 'rejected');

  document.getElementById('admin-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Requests</div><div class="stat-num">${stats.totals.requests}</div><div class="stat-sub">Across all employees</div></div>
    <div class="stat-card accent-amber"><div class="stat-label">Pending</div><div class="stat-num">${stats.totals.pending}</div><div class="stat-sub">Awaiting review</div></div>
    <div class="stat-card accent-green"><div class="stat-label">Approved</div><div class="stat-num">${stats.totals.approved}</div><div class="stat-sub">${Object.values(stats.daysByType).reduce((a,b)=>a+b,0)} days granted</div></div>
    <div class="stat-card accent-red"><div class="stat-label">Rejected</div><div class="stat-num">${stats.totals.rejected}</div><div class="stat-sub">${stats.employees} employees</div></div>`;

  document.getElementById('pending-count').textContent = pending.length ? `${pending.length} waiting` : '';
  document.getElementById('pending-empty').classList.toggle('hidden', pending.length > 0);
  document.getElementById('pending-list').innerHTML = pending
    .sort((a, b) => a.appliedOn.localeCompare(b.appliedOn))
    .map(l => leaveItemHTML(l, `
      <div class="leave-actions">
        <button class="btn btn-success btn-sm" onclick="reviewLeave('${l.id}','approve')">Approve</button>
        <button class="btn btn-danger btn-sm" onclick="reviewLeave('${l.id}','reject')">Reject</button>
      </div>`)).join('');

  // Admin chart: days by type
  const types = ['Casual', 'Sick', 'Earned'];
  if (charts.admin) charts.admin.destroy();
  charts.admin = new Chart(document.getElementById('admin-chart'), {
    type: 'bar',
    data: {
      labels: types,
      datasets: [{
        label: 'Approved days',
        data: types.map(t => stats.daysByType[t] || 0),
        backgroundColor: types.map(t => COLORS[t]),
        borderRadius: 8, borderSkipped: false,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#8b98b8' }, grid: { display: false } },
        y: { ticks: { color: '#8b98b8' }, grid: { color: 'rgba(139,152,184,.12)' }, beginAtZero: true },
      },
    },
  });

  renderAdminTable();
}

function renderAdminTable() {
  const filter = document.getElementById('admin-filter').value;
  let leaves = [...allLeaves].sort((a, b) => b.appliedOn.localeCompare(a.appliedOn));
  if (filter !== 'all') leaves = leaves.filter(l => l.status === filter);

  document.getElementById('admin-body').innerHTML = leaves.map(l => `
    <tr>
      <td><div class="emp-cell"><div class="avatar">${l.employeeName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</div>${l.employeeName}</div></td>
      <td>${l.employeeDepartment || '—'}</td>
      <td>${l.type}</td>
      <td>${l.start} → ${l.end}</td>
      <td><strong>${l.days}</strong></td>
      <td><span class="status ${l.status}">${l.status}</span></td>
      <td>${l.appliedOn}</td>
    </tr>`).join('') || '<tr><td colspan="7" class="empty">No requests.</td></tr>';
}

async function reviewLeave(id, action) {
  try {
    await api(`/api/leaves/${id}/${action}`, { method: 'POST' });
    toast(`Request ${action === 'approve' ? 'approved' : 'rejected'}`, '', action === 'approve' ? 'success' : 'info');
    refreshAll();
  } catch (e) { toast('Error', e.message, 'error'); }
}

/* ---------- Real-time (SSE) ---------- */
function connectSSE() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource('/api/events');

  eventSource.addEventListener('leave:created', (e) => {
    const l = JSON.parse(e.data);
    if (l.employeeId !== API.user.id) {
      toast('New leave request', `${l.employeeName} applied for ${l.type} leave (${l.days} day${l.days>1?'s':''})`, 'info');
    }
    refreshAll();
  });
  eventSource.addEventListener('leave:updated', () => refreshAll());
  eventSource.addEventListener('leave:deleted', () => refreshAll());
}

/* ---------- Init ---------- */
function init() {
  // Role toggle
  let selectedRole = 'employee';
  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedRole = btn.dataset.role;
    });
  });

  // Auth tabs (Sign In / Create Account)
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.auth === 'login';
      document.getElementById('login-form').classList.toggle('hidden', !isLogin);
      document.getElementById('signup-form').classList.toggle('hidden', isLogin);
    });
  });

  // Employee signup
  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('signup-error');
    err.textContent = '';
    try {
      const data = await signup({
        name: document.getElementById('su-name').value.trim(),
        username: document.getElementById('su-username').value.trim(),
        password: document.getElementById('su-password').value,
        department: document.getElementById('su-department').value.trim(),
        email: document.getElementById('su-email').value.trim(),
      });
      document.getElementById('signup-form').reset();
      document.querySelector('.auth-tab[data-auth="login"]').click();
      document.getElementById('login-username').value = data.user.username;
      document.getElementById('login-password').focus();
      toast('Account created!', 'Please sign in with your new credentials.', 'success');
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
  // Login
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('login-error');
    err.textContent = '';
    try {
      await login(
        document.getElementById('login-username').value.trim(),
        document.getElementById('login-password').value,
        selectedRole
      );
      document.getElementById('login-form').reset();
      showApp();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });

  document.getElementById('logout-btn').addEventListener('click', logout);

  // Nav
  document.querySelectorAll('.nav-item').forEach(btn =>
    btn.addEventListener('click', () => switchView(btn.dataset.view)));

  // Filters
  document.getElementById('history-filter').addEventListener('change', renderHistory);
  document.getElementById('admin-filter').addEventListener('change', renderAdminTable);

  // Session restore
  if (API.token && API.user) {
    api('/api/me')
      .then(() => showApp())
      .catch(() => { localStorage.removeItem('lf_token'); localStorage.removeItem('lf_user'); showLogin(); });
  } else {
    showLogin();
  }
}

document.addEventListener('DOMContentLoaded', init);
