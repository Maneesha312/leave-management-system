# LeaveFlow — Leave Management System

A full-stack Leave Management System with a modern dark-themed UI, real-time updates, and a persistent backend. Employees apply for leave and track balances; admins review requests in real time.

## Features

- **Employee & Admin login** — role-based access with token authentication (Bearer tokens, session persisted in browser).
- **Employee self-registration** — anyone can create an employee account (name, username, password, department) from the login page; only admins are seeded.
- **Apply leave** — type (Casual / Sick / Earned), date range, days, reason — with server-side validation.
- **Approve / Reject** — admin approval queue; balances are deducted only on approval.
- **Leave history** — filterable history with status badges; employees can cancel pending requests.
- **Leave balance tracking** — annual quotas (Casual 12, Sick 12, Earned 15) shown as animated progress bars.
- **Admin dashboard** — org stats, approval queue, all-requests table, and Chart.js analytics.
- **Real-time updates** — Server-Sent Events push new requests and status changes to all connected clients instantly (live badge in sidebar, toast notifications).
- **Modern UI** — dark theme, sidebar navigation, animated transitions, responsive layout.

## Tech Stack

| Layer    | Technology                                        |
|----------|---------------------------------------------------|
| Backend  | Node.js + Express 4                                |
| Database | JSON file (`data/db.json`) — zero-config persistence |
| Real-time| Server-Sent Events (SSE)                           |
| Frontend | Vanilla JS, Chart.js 4 (CDN), CSS3 custom properties |
| Auth     | Token-based (crypto-random Bearer tokens)          |

## Project Structure

```
leave-management-system/
├── server.js            # Express API + SSE + static file serving
├── package.json
├── data/
│   └── db.json          # Persistent store (users + leave requests)
├── public/
│   ├── index.html       # SPA markup
│   ├── css/style.css    # Dark modern theme
│   └── js/app.js        # Frontend logic + API client + SSE
├── README.md
└── BRD.md
```

## Setup Instructions

**Prerequisites:** Node.js ≥ 18

```bash
npm install
npm start          # or: npm run dev  (auto-restart on changes)
```

Open **http://localhost:3000**.

### Demo Accounts

| Role     | Username | Password   |
|----------|----------|------------|
| Admin    | `admin`  | `admin123` |

> **Employees self-register** via the *Create Account* tab on the login page (name, username, password, department, optional email). Only the admin account is seeded in `data/db.json`; leave data starts empty.

## Environment Variables

| Variable | Description              | Default |
|----------|--------------------------|---------|
| `PORT`   | HTTP port for the server | `3000`  |

Example: `PORT=8080 npm start`

## API Reference

All endpoints (except login) require `Authorization: Bearer <token>`.

| Method | Endpoint                  | Description                                  |
|--------|---------------------------|----------------------------------------------|
| POST   | `/api/login`              | `{username, password, role}` → `{token, user}` |
| POST   | `/api/signup`             | Public — register employee `{name, username, password, department, email?}` → `{token, user}` |
| POST   | `/api/logout`             | Invalidate token                             |
| GET    | `/api/me`                 | Current user profile                         |
| GET    | `/api/leaves`             | Leave requests (employees see only their own)|
| POST   | `/api/leaves`             | Create request `{type, start, end, days, reason}` |
| POST   | `/api/leaves/:id/approve` | Admin only — approve pending request         |
| POST   | `/api/leaves/:id/reject`  | Admin only — reject pending request          |
| DELETE | `/api/leaves/:id`         | Cancel own pending request (or admin)        |
| GET    | `/api/stats`              | Totals, days-by-type, 6-month monthly trend  |
| GET    | `/api/events`             | SSE stream — `leave:created`, `leave:updated`, `leave:deleted` |

## Deployment

The app is a single Node.js process serving both API and static frontend — deployable to any Node host.

> **Note:** GitHub Pages cannot run the backend (static hosting only), and Vercel's serverless filesystem is ephemeral — the JSON database would reset on every request. Use Render, Railway, or a VPS instead.

### Deploy to Render (recommended, free tier)

1. Push this project to a GitHub repository.
2. On [render.com](https://render.com): **New → Web Service → Connect repo**.
3. Settings: **Build Command** `npm install`, **Start Command** `npm start`.
4. Add environment variable `NODE_VERSION=20` if prompted.
5. Deploy — live URL is `https://<service>.onrender.com`.

### Deploy to Railway

1. Push to GitHub, then import the repo at [railway.app](https://railway.app).
2. Railway auto-detects Node.js; no config needed.
3. Deploy and copy the generated domain.

### Deploy to a VPS

```bash
git clone <repo> && cd leave-management-system
npm install
NODE_ENV=production PORT=3000 nohup node server.js &
# Put nginx/Caddy in front for HTTPS
```

### Updating

Push to `main` — Render/Railway auto-redeploy on every push.

### Live Deployment URL

> _To be filled in after deployment._

## Security Notes

- Passwords are stored in plaintext in `data/db.json` — **demo only**. For production, hash passwords (bcrypt) and move to a real database (PostgreSQL).
- Tokens are in-memory and expire on server restart — users simply log in again.
- Add HTTPS (handled automatically by Render/Railway) before real use.

## License

MIT
