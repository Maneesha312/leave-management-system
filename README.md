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
| Database | JSON file ([data/db.json](cci:7://file:///c:/Users/Lenovo/CascadeProjects/2048/leave-management-system/data/db.json:0:0-0:0)) — zero-config persistence |
| Real-time| Server-Sent Events (SSE)                           |
| Frontend | Vanilla JS, Chart.js 4 (CDN), CSS3 custom properties |
| Auth     | Token-based (crypto-random Bearer tokens)          |

## Project Structure
