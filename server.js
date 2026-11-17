/* ============================================================
   Leave Management System — Express backend
   REST API + Server-Sent Events for real-time updates
   Persistence: JSON file (data/db.json)
   ============================================================ */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');

const ALLOCATION = { Casual: 12, Sick: 12, Earned: 15 };

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- Database helpers ---------- */
const SEED_DB = {
  users: [
    { id: 'u_admin', username: 'admin', password: 'admin123', name: 'Admin User', role: 'admin', department: 'HR', email: 'admin@company.com' },
  ],
  leaves: [],
};

function readDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    writeDb(SEED_DB);
    return JSON.parse(JSON.stringify(SEED_DB));
  }
}
function writeDb(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

/* ---------- Auth tokens (in-memory) ---------- */
const tokens = new Map(); // token -> userId

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const userId = token && tokens.get(token);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const db = readDb();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  req.user = user;
  next();
}

/* ---------- SSE (real-time) ---------- */
const sseClients = new Set();
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((res) => {
    try { res.write(payload); } catch { sseClients.delete(res); }
  });
}

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('event: connected\ndata: {}\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

/* ---------- Auth ---------- */
app.post('/api/login', (req, res) => {
  const { username, password, role } = req.body || {};
  const db = readDb();
  const user = db.users.find(
    (u) => u.username.toLowerCase() === String(username || '').trim().toLowerCase() && u.password === password && u.role === role
  );
  if (!user) return res.status(401).json({ error: 'Invalid credentials for the selected role.' });

  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, user.id);
  res.json({ token, user: publicUser(user) });
});

app.post('/api/signup', (req, res) => {
  const { name, username, password, department, email } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Full name is required.' });
  if (!username || !username.trim()) return res.status(400).json({ error: 'Username is required.' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (!department || !department.trim()) return res.status(400).json({ error: 'Department is required.' });

  const db = readDb();
  const uname = username.trim().toLowerCase();
  if (db.users.some((u) => u.username.toLowerCase() === uname)) {
    return res.status(409).json({ error: 'Username already taken.' });
  }

  const user = {
    id: 'u' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'),
    username: uname,
    password,
    name: name.trim(),
    role: 'employee',
    department: department.trim(),
    email: (email || '').trim(),
  };
  db.users.push(user);
  writeDb(db);

  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, user.id);
  res.status(201).json({ token, user: publicUser(user) });
});
app.post('/api/logout', authRequired, (req, res) => {
  const header = req.headers.authorization || '';
  tokens.delete(header.slice(7));
  res.json({ ok: true });
});

app.get('/api/me', authRequired, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

function publicUser(u) {
  const { password, ...rest } = u;
  return rest;
}

/* ---------- Leave balance ---------- */
function getUsedDays(db, employeeId, type, excludeId = null) {
  return db.leaves
    .filter((l) => l.employeeId === employeeId && l.type === type && l.status === 'approved' && l.id !== excludeId)
    .reduce((sum, l) => sum + l.days, 0);
}

function balancesFor(db, employeeId) {
  const result = {};
  for (const type of Object.keys(ALLOCATION)) {
    const used = getUsedDays(db, employeeId, type);
    result[type] = { total: ALLOCATION[type], used, remaining: ALLOCATION[type] - used };
  }
  return result;
}

/* ---------- Leaves API ---------- */
app.get('/api/leaves', authRequired, (req, res) => {
  const db = readDb();
  let leaves = db.leaves;
  if (req.user.role !== 'admin') {
    leaves = leaves.filter((l) => l.employeeId === req.user.id);
  }
  leaves = [...leaves].sort((a, b) => b.appliedOn.localeCompare(a.appliedOn));
  res.json({ leaves });
});

app.post('/api/leaves', authRequired, (req, res) => {
  if (req.user.role !== 'employee') return res.status(403).json({ error: 'Only employees can apply for leave.' });
  const { type, start, end, days, reason } = req.body || {};
  const db = readDb();

  if (!ALLOCATION[type]) return res.status(400).json({ error: 'Invalid leave type.' });
  if (!start || !end || end < start) return res.status(400).json({ error: 'End date must be on or after start date.' });
  const numDays = parseInt(days, 10);
  if (!numDays || numDays < 1 || numDays > 60) return res.status(400).json({ error: 'Days must be between 1 and 60.' });
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'Reason is required.' });

  const bal = balancesFor(db, req.user.id)[type];
  if (bal.remaining < numDays) {
    return res.status(400).json({ error: `Insufficient ${type} balance (${bal.remaining} days remaining).` });
  }

  const leave = {
    id: 'l' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'),
    employeeId: req.user.id,
    employeeName: req.user.name,
    employeeDepartment: req.user.department,
    type, start, end, days: numDays,
    reason: reason.trim(),
    status: 'pending',
    appliedOn: new Date().toISOString().slice(0, 10),
  };
  db.leaves.push(leave);
  writeDb(db);
  broadcast('leave:created', leave);
  res.status(201).json({ leave });
});

app.post('/api/leaves/:id/approve', authRequired, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only.' });
  const db = readDb();
  const leave = db.leaves.find((l) => l.id === req.params.id);
  if (!leave) return res.status(404).json({ error: 'Leave not found.' });
  if (leave.status !== 'pending') return res.status(400).json({ error: 'Request already processed.' });

  const bal = balancesFor(db, leave.employeeId)[leave.type];
  if (bal.remaining < leave.days) {
    return res.status(400).json({ error: `Cannot approve: ${leave.employeeName} has insufficient ${leave.type} balance.` });
  }

  leave.status = 'approved';
  leave.reviewedBy = req.user.name;
  leave.reviewedOn = new Date().toISOString().slice(0, 10);
  writeDb(db);
  broadcast('leave:updated', leave);
  res.json({ leave });
});

app.post('/api/leaves/:id/reject', authRequired, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only.' });
  const db = readDb();
  const leave = db.leaves.find((l) => l.id === req.params.id);
  if (!leave) return res.status(404).json({ error: 'Leave not found.' });
  if (leave.status !== 'pending') return res.status(400).json({ error: 'Request already processed.' });

  leave.status = 'rejected';
  leave.reviewedBy = req.user.name;
  leave.reviewedOn = new Date().toISOString().slice(0, 10);
  writeDb(db);
  broadcast('leave:updated', leave);
  res.json({ leave });
});

app.delete('/api/leaves/:id', authRequired, (req, res) => {
  const db = readDb();
  const idx = db.leaves.findIndex((l) => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Leave not found.' });
  const leave = db.leaves[idx];
  const isOwner = leave.employeeId === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Forbidden.' });
  if (leave.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be cancelled.' });

  db.leaves.splice(idx, 1);
  writeDb(db);
  broadcast('leave:deleted', { id: leave.id });
  res.json({ ok: true });
});

/* ---------- Stats ---------- */
app.get('/api/stats', authRequired, (req, res) => {
  const db = readDb();
  const leaves = db.leaves;
  const byStatus = { pending: 0, approved: 0, rejected: 0 };
  const byType = {};
  leaves.forEach((l) => {
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
    byType[l.type] = (byType[l.type] || 0) + l.days;
  });

  // Monthly approved-leave days for charts (last 6 months)
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleString('en', { month: 'short' }), days: 0 });
  }
  leaves.filter((l) => l.status === 'approved').forEach((l) => {
    const m = months.find((x) => l.start.startsWith(x.key));
    if (m) m.days += l.days;
  });

  res.json({
    totals: { requests: leaves.length, ...byStatus },
    daysByType: byType,
    monthly: months,
    employees: db.users.filter((u) => u.role === 'employee').length,
  });
});

/* ---------- SPA fallback ---------- */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Leave Management System running at http://localhost:${PORT}`);
});
