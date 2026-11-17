# Business Requirements Document — LeaveFlow (Leave Management System)

## 1. Overview

LeaveFlow is a full-stack web application that digitizes the employee leave request and approval process. Employees apply for leave, monitor their balances, and track request status in real time. Administrators review pending requests, approve or reject them, and monitor organization-wide leave analytics — with instant updates pushed to all connected clients.

## 2. Objectives

- Eliminate paper/spreadsheet-based leave tracking.
- Provide real-time leave balance visibility and instant request notifications.
- Give admins a live approval queue and analytics dashboard.
- Maintain an auditable history of all leave requests and decisions.

## 3. Stakeholders

| Stakeholder      | Interest                                              |
|------------------|-------------------------------------------------------|
| Employee         | Apply for leave, check balance, track status, cancel  |
| Admin / HR       | Approve/reject requests, view analytics               |
| Organization     | Enforce leave policy, reduce administrative load      |

## 4. Functional Requirements

### 4.1 Authentication
- FR-1: Users log in with username, password, and role (Employee/Admin).
- FR-2: Token-based sessions persist across browser refreshes until logout or server restart.
- FR-3: Role-based access — employees only see their own data; admin endpoints require admin role.
- FR-3a: Employees self-register via the signup form (name, username, password, department, optional email); role is always `employee`. Only the admin account is seeded.

### 4.2 Employee Module
- FR-4: Dashboard with per-type leave balances (progress bars) and usage charts.
- FR-5: Apply for leave: type, start/end dates, days, reason.
- FR-6: Server-side validation: valid type, end ≥ start, 1–60 days, reason required, sufficient balance.
- FR-7: Leave history with status filter (All / Pending / Approved / Rejected).
- FR-8: Cancel a pending request (DELETE endpoint).
- FR-9: Real-time toast notifications when admin approves/rejects their request.

### 4.3 Admin Module
- FR-10: Stats dashboard: total, pending, approved, rejected, days granted, employee count.
- FR-11: Live approval queue with Approve/Reject actions (updates broadcast instantly).
- FR-12: All-requests table with status filter and employee/department info.
- FR-13: Org analytics: approved days by leave type, 6-month trend chart.
- FR-14: Real-time notification when any employee submits a request.

### 4.4 Leave Policy (defaults)

| Leave Type | Annual Allocation |
|------------|-------------------|
| Casual     | 12 days           |
| Sick       | 12 days           |
| Earned     | 15 days           |

Balances are deducted only when a request is **approved**. Pending and rejected requests do not consume balance.

## 5. Non-Functional Requirements

- **Real-time:** Request/status changes propagate to all connected clients in <1s via SSE.
- **Usability:** Modern dark-themed responsive UI; works on desktop and mobile.
- **Performance:** Single Node process; JSON-file persistence suitable for small teams.
- **Security (demo scope):** Bearer-token auth, role checks on every endpoint. Production requires bcrypt password hashing, HTTPS, and a real RDBMS.
- **Maintainability:** Clean separation — `server.js` (API), `public/` (frontend), `data/db.json` (state).

## 6. Technical Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Node.js + Express                  │
│  ┌─────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │  Auth   │  │ REST API │  │  SSE Event Stream  │  │
│  │ (token) │  │ /api/*   │  │  /api/events       │  │
│  └─────────┘  └──────────┘  └────────────────────┘  │
│         JSON file store (data/db.json)               │
└──────────────────────┬───────────────────────────────┘
                       │ HTTP + SSE
┌──────────────────────▼───────────────────────────────┐
│            Browser SPA (public/)                     │
│  Login / Signup → Dashboard / Apply / History / Admin Panel │
│  Chart.js analytics · Toast notifications            │
└──────────────────────────────────────────────────────┘
```

- **Backend:** Express 4, crypto-random Bearer tokens (in-memory), JSON file DB with read/write per request.
- **Real-time:** SSE broadcasts `leave:created`, `leave:updated`, `leave:deleted` to all clients.
- **Frontend:** Vanilla JS SPA, Chart.js 4 via CDN, CSS3 custom properties, no build step.

## 7. Data Model

**User:** `{ id, username, password, name, role, department, email }`

**LeaveRequest:** `{ id, employeeId, employeeName, employeeDepartment, type, start, end, days, reason, status, appliedOn, reviewedBy?, reviewedOn? }`

## 8. Deployment

### 8.1 Hosting Platform
The application is hosted on **Render** (free-tier web service) as a single Node.js process. Railway is an equivalent alternative. Unlike a static site, this requires a Node.js runtime because of the Express API and SSE stream.

### 8.2 Deployment Approach
- GitHub repository → connected to Render/Railway → auto-deploy on push to `main`.
- Render/Railway provide HTTPS, process management, and a persistent filesystem for `data/db.json`.
- The same process serves the REST API, SSE stream, and static frontend.

### 8.3 Required Services
- GitHub (source control)
- Render or Railway account (hosting)
- Node.js ≥ 18 runtime (provided by host)

### 8.4 Steps to Deploy (Initial)
1. Create a GitHub repo and push:
   ```bash
   git init && git add . && git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
2. **Render:** New Web Service → connect repo → Build `npm install`, Start `npm start` → Deploy.
3. **Railway:** Import repo → auto-detected → Deploy.

### 8.5 Steps to Update
```bash
git add . && git commit -m "Describe change" && git push
```
Host auto-redeploys within ~1 minute.

### 8.6 Live URL
> _To be filled in after deployment._

## 9. Assumptions & Constraints

- Single-organization deployment; multi-tenancy out of scope.
- JSON-file DB suits small teams; migrate to PostgreSQL for scale.
- Auth tokens are in-memory — restart logs everyone out (acceptable for demo).
- Leave quotas are constants in `server.js` (`ALLOCATION`).

## 10. Future Enhancements

- PostgreSQL + bcrypt password hashing + JWT auth.
- Email notifications on submit/approve/reject.
- Leave cancellation by admin, half-day support, holiday calendar.
- Manager-level approvals, org-chart routing, CSV/PDF export.
- Recurring leave policies and accrual rules.
