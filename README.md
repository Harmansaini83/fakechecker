# 🌾 FakeChecker

**Verify seeds, pesticides and fertilizers using signed QR codes, scan-history analysis and community reporting.**

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-Vite-61DAFB?logo=react&logoColor=black)
![Fastify](https://img.shields.io/badge/Fastify-API-000000?logo=fastify&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-PostGIS-4169E1?logo=postgresql&logoColor=white)
![Tests](https://img.shields.io/badge/tests-45%20passing-16a34a)
![Data](https://img.shields.io/badge/evaluation-synthetic%20data-d97706)
![Status](https://img.shields.io/badge/status-academic%20prototype-6b7280)

> ## ⚠️ The one rule of this project
> **A valid QR code or signature never proves a product is physically genuine.**
> FakeChecker only tells you whether a code matches its records and behaves normally. Every screen, the report and the demo say this explicitly.

---

## 📑 Table of Contents

1. [Overview](#-overview)
2. [Problem Statement](#-problem-statement)
3. [Key Features](#-key-features)
4. [How Verification Works](#-how-verification-works)
5. [Verdicts](#-verdicts)
6. [Architecture](#-architecture)
7. [Tech Stack](#-tech-stack)
8. [Project Structure](#-project-structure)
9. [Getting Started](#-getting-started)
10. [Environment Variables](#-environment-variables)
11. [Available Scripts](#-available-scripts)
12. [API Reference](#-api-reference)
13. [Roles and Access Control](#-roles-and-access-control)
14. [Security Design](#-security-design)
15. [Privacy Design](#-privacy-design)
16. [Testing and Evaluation](#-testing-and-evaluation)
17. [Screenshots](#-screenshots)
18. [Known Limitations](#-known-limitations)
19. [Future Scope](#-future-scope)
20. [Author](#-author)
21. [License](#-license)

---

## 🔎 Overview

FakeChecker is a full-stack web application that helps farmers and retailers check agricultural inputs (seeds, pesticides, fertilizers) before using or selling them.

Each package carries a QR code containing its ID and an **Ed25519 digital signature**. When a user scans the code (or types it), the server:

1. checks the signature,
2. looks up the package and its batch,
3. checks expiry and recall status,
4. analyses scan history for signs of cloning,
5. returns one of seven plain-language verdicts with reasons and next steps.

Farmers need **no account**. Staff (admin, moderator, manufacturer) log in through a separate dashboard at `/admin`.

---

## 🧩 Problem Statement

- Fake and copied agri-inputs reach farmers through normal shops, causing crop loss, financial loss and soil damage.
- A plain QR code can be photographed and printed onto a fake packet.
- Farmers have no quick, trustworthy way to check a packet before use.
- Authorities cannot easily see where suspicious packets appear.

**Goal:** a simple, honest check, combined with scan-history cloning detection, a reporting loop and privacy-safe hotspot mapping.

---

## ✨ Key Features

| Area | What it does |
|---|---|
| **QR verification** | Camera scan (`qr-scanner`) or manual code entry; one decode triggers exactly one API call |
| **Digital signatures** | Ed25519 signing with a key ID, so keys can be rotated |
| **Verdict + risk engine** | Signature, expiry, recall, scan-count and geographic-jump checks |
| **Public API** | Zod validation, consistent response format, rate limiting, Swagger docs |
| **Authentication** | JWT access tokens (15 min), rotating refresh tokens (7 days, stored hashed), reuse detection |
| **Role-based access** | `admin`, `moderator`, `manufacturer`, enforced on the server for every protected route |
| **Audit log** | Logins, failed logins, logouts, user creation/deactivation, report decisions |
| **Reporting** | Public report form with up to 3 image uploads, content-based file checks, duplicate detection |
| **Moderation queue** | Staff confirm or reject reports and view evidence images |
| **Heatmap** | PostGIS grid aggregation with a minimum-report threshold; coarse public view, finer staff view |
| **Multilingual** | English, Hindi, Marathi |
| **Offline mode** | Codes typed or scanned while offline are queued on the device and checked later |
| **Privacy controls** | Location is opt-in and off by default; one-tap deletion of local data; contact details purged after 90 days |
| **Dashboards** | Moderator queue and hotspots, manufacturer batch view (own batches only), admin users and audit log |
| **Evaluation harness** | Reports accuracy, false-positive rate, false-negative rate and latency separately |

---

## ⚙️ How Verification Works

```mermaid
flowchart TD
    A[User scans QR or types code] --> B{Code readable?}
    B -- No --> INV[invalid]
    B -- Yes --> C{Signature valid?}
    C -- Bad signature --> INV
    C -- Unknown issuer --> UNV[unverified]
    C -- Valid --> D{Package found?}
    D -- No --> UNV
    D -- Yes --> E{Confirmed counterfeit?}
    E -- Yes --> CC[confirmed_counterfeit]
    E -- No --> F{Batch recalled or expired?}
    F -- Recalled --> REC[recalled]
    F -- Expired --> EXP[expired]
    F -- No --> G{Scan history normal?}
    G -- Too many scans or distant locations --> SUS[suspicious]
    G -- Normal --> VER[verified]
```

**Design decisions**

- **Verdicts are never cached.** A verdict depends on scan history that changes with every scan, so caching would return stale answers.
- **Unknown issuer ≠ fake.** It returns `unverified`, because we cannot tell and should not claim either way.
- **Scan recording** can be switched off (`record: false`) so the evaluation harness does not pollute scan counts.

---

## 🚦 Verdicts

| Verdict | Meaning | UI tone |
|---|---|---|
| `verified` | Code matches records, signature valid, history looks normal | 🟢 Green |
| `suspicious` | Valid code, but scanned unusually (very many times or in far-apart places) | 🟡 Yellow |
| `unverified` | Issuer not recognised; cannot confirm either way | ⚪ Grey |
| `invalid` | Malformed, altered or forged code | 🔴 Red |
| `expired` | Valid code, batch past expiry | 🔴 Red |
| `recalled` | Manufacturer recalled this batch | 🔴 Red |
| `confirmed_counterfeit` | Confirmed as counterfeit by reviewers | 🔴 Red |

---

## 🏗 Architecture

```mermaid
flowchart LR
    subgraph Client
        PWA[Scanner PWA<br/>React + Vite]
        ADM[Staff dashboard<br/>/admin]
    end
    subgraph Server
        API[Fastify API<br/>Zod · JWT · Rate limit · Swagger]
        ENG[Verdict + risk engine<br/>Ed25519 verification]
    end
    DB[(PostgreSQL + PostGIS)]
    FS[(Evidence files<br/>local disk)]

    PWA -->|POST /api/verify, /api/reports| API
    ADM -->|JWT-protected routes| API
    API --> ENG
    API --> DB
    API --> FS
```

- The PWA and the admin dashboard are **one React app**; `/admin` switches to the staff UI.
- In development, Vite proxies `/api` and `/health` to the backend (no CORS setup needed).
- The service worker **never caches** `/api`, `/docs` or `/health`.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, TypeScript, `vite-plugin-pwa`, `qr-scanner`, Leaflet |
| Backend | Node.js, Fastify, TypeScript (`tsx` for running) |
| Database | PostgreSQL with PostGIS |
| Validation | Zod (Swagger schemas are documentation only) |
| Auth | `@fastify/jwt`, `bcryptjs` (cost 12), SHA-256-hashed refresh tokens |
| Security middleware | `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit` |
| Uploads | `@fastify/multipart` with content-based file-type detection |
| Docs | `@fastify/swagger`, `@fastify/swagger-ui` |
| Testing | Vitest (unit + integration), `autocannon` (load) |
| Tooling | Docker Compose (local database), ESLint, GitHub Actions CI |

---

## 📁 Project Structure

```text
fakechecker/
├── backend/
│   ├── migrations/              # SQL migrations (schema, auth, reports)
│   ├── src/
│   │   ├── app.ts               # Fastify app builder (plugins, routes, error handling)
│   │   ├── server.ts            # Entry point with graceful shutdown
│   │   ├── http.ts              # ok() / fail() / validationFail() response helpers
│   │   ├── schemas.ts           # Zod schemas
│   │   ├── auth/guards.ts       # requireRole() and JWT typing
│   │   ├── db/                  # pool, migrate, seed
│   │   ├── routes/              # verify, auth, admin, reports, heatmap, manufacturer
│   │   ├── services/            # verdict, password, audit, evidence (+ signing and risk logic)
│   │   └── scripts/             # evaluate, purge, demo-heatmap
│   ├── tests/                   # *.test.ts (unit) and *.int.test.ts (integration), testcases.json
│   ├── vitest.config.ts
│   └── vitest.int.config.ts
├── frontend/
│   ├── public/                  # PWA icons
│   └── src/
│       ├── App.tsx              # Farmer-facing app
│       ├── Scanner.tsx          # Camera scanning
│       ├── ResultCard.tsx       # Verdict, reasons, next steps, disclaimer
│       ├── ReportForm.tsx       # Report with evidence upload
│       ├── Heatmap.tsx          # Public hotspot map
│       ├── Privacy.tsx          # Privacy screen and local data deletion
│       ├── i18n.ts              # English / Hindi / Marathi
│       ├── local.ts             # Offline queue and local preferences
│       └── admin/               # Staff login and dashboards
├── docs/
│   ├── evaluation-latest.json   # Generated by `npm run evaluate`
│   └── screenshots/             # Add your screenshots here
├── docker-compose.yml           # Local PostgreSQL + PostGIS
└── .github/workflows/           # CI
```

> Exact file names under `db/` and `services/` may differ slightly in your copy.

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20 or newer
- Docker Desktop (for PostgreSQL + PostGIS)
- Git

### 1. Clone

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/fakechecker.git
cd fakechecker
```

### 2. Start the database

```bash
docker compose up -d
```

### 3. Configure the backend

```bash
cd backend
npm install
```

Create `backend/.env` (see [Environment Variables](#-environment-variables)). Generate a JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4. Create tables and demo data

```bash
npm run migrate
npm run seed
```

`seed` **wipes and recreates** demo data, including the demo staff accounts. Never run it against real data.

### 5. Run the backend

```bash
npm run dev
```

- Health check: http://localhost:3000/health
- Swagger UI: http://localhost:3000/docs

### 6. Run the frontend (new terminal)

```bash
cd frontend
npm install
npm run dev
```

- Farmer app: http://localhost:5173
- Staff dashboard: http://localhost:5173/admin

### Demo staff accounts (local demo only)

| Email | Role | Password |
|---|---|---|
| `admin@demo.test` | admin | `Demo@12345` |
| `moderator@demo.test` | moderator | `Demo@12345` |
| `manufacturer@demo.test` | manufacturer (manufacturer 1) | `Demo@12345` |

> These credentials exist only for local demo data. Never use them anywhere public.

### Try a verification

1. Open `backend/tests/testcases.json` and copy the `code` of any case whose `expected` is `"verified"`.
2. Paste it into the app, or into Swagger at `POST /api/verify`:

```json
{ "code": "PASTE_CODE_HERE", "scanMode": "farmer" }
```

3. To test the camera, turn a code into a QR image and scan it from another screen:

```bash
npx qrcode -o genuine.png "PASTE_CODE_HERE"
```

Camera access requires HTTPS or `localhost`. For a phone demo without deploying, use a temporary tunnel: `cloudflared tunnel --url http://localhost:5173`.

> ⚠️ Each real verification **records a scan**, which changes scan counts and cloning checks. Run `npm run seed` to reset before evaluating or running integration tests.

---

## 🔐 Environment Variables

Create `backend/.env`:

```env
# Database (adjust user, password, host, port and name to match your docker-compose.yml)
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/DBNAME

# Auth (required in production; a dev-only fallback exists for local use)
JWT_SECRET=PASTE_A_LONG_RANDOM_STRING

# Server
PORT=3000
FRONTEND_ORIGIN=http://localhost:5173

# Optional
UPLOAD_DIR=uploads
HEATMAP_THRESHOLD=3
RATE_LIMIT_MAX=60
TRUST_PROXY=            # leave empty locally; set to number of proxy hops behind a reverse proxy

# Ed25519 signing key variables: use the names from your Phase 2 signing code
```

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | project-specific |
| `JWT_SECRET` | Signs access tokens; the app refuses to start in production without it | dev-only fallback |
| `PORT` | API port | `3000` |
| `FRONTEND_ORIGIN` | Allowed CORS origin | `http://localhost:5173` |
| `UPLOAD_DIR` | Where evidence images are stored | `uploads` |
| `HEATMAP_THRESHOLD` | Distinct packets per map cell before it counts as an alert | `3` |
| `RATE_LIMIT_MAX` | Global requests per minute per IP | `60` |
| `TRUST_PROXY` | Number of trusted proxy hops (unset means `X-Forwarded-For` is ignored) | disabled |

Optional frontend variable: `VITE_API_URL` (empty by default, so the Vite proxy is used).

`.env` files and `uploads/` are git-ignored. Never commit secrets or signing keys.

---

## 📜 Available Scripts

### Backend (`backend/`)

| Command | What it does |
|---|---|
| `npm run dev` | Start the API with auto-reload |
| `npm run migrate` | Apply SQL migrations |
| `npm run seed` | Reset and load synthetic demo data and demo staff accounts |
| `npm test` | Unit tests (no database needed) |
| `npm run test:int` | Integration tests (needs seeded database) |
| `npm run evaluate` | Re-seeds, runs the evaluation harness, writes `docs/evaluation-latest.json` |
| `npm run typecheck` | TypeScript check |
| `npm run purge` | Removes report contact details older than 90 days |
| `npm run demo:heatmap` | Inserts demo hotspot reports (demo only, delete before real use) |

### Frontend (`frontend/`)

| Command | What it does |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Serve the production build (use this to test the PWA and service worker) |
| `npm test` | Frontend unit tests |
| `npx tsc -b` | TypeScript check |

---

## 📡 API Reference

All responses use one format:

```json
{ "ok": true,  "data": { } }
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "Invalid request.", "details": [] } }
```

Interactive docs are available at `/docs` (Swagger UI).

### Public

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | API and database status |
| `POST` | `/api/verify` | Verify a code. Body: `code`, optional `scanMode` (`farmer` or `retailer`), optional `location {lat, lng}` |
| `POST` | `/api/reports` | Submit a report (`multipart/form-data`, up to 3 JPG/PNG/WebP images, 5 MB each); 5 per hour per IP |
| `GET` | `/api/heatmap` | Coarse hotspot cells that pass the threshold |

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Staff login; 5 attempts per minute per IP |
| `POST` | `/api/auth/refresh` | Swap a refresh token for a new pair (old token is revoked) |
| `POST` | `/api/auth/logout` | Revoke a refresh token |
| `GET` | `/api/auth/me` | Current user (Bearer token) |

### Staff (Bearer token required)

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| `GET` | `/api/admin/users` | admin | List staff users |
| `POST` | `/api/admin/users` | admin | Create a staff user |
| `PATCH` | `/api/admin/users/:id/deactivate` | admin | Deactivate a user and revoke their sessions |
| `GET` | `/api/admin/audit-log` | admin | Latest audit entries |
| `GET` | `/api/moderation/reports` | moderator, admin | Moderation queue (filter by status) |
| `PATCH` | `/api/moderation/reports/:id` | moderator, admin | Confirm or reject a report |
| `GET` | `/api/moderation/evidence/:id` | moderator, admin | Download an evidence image |
| `GET` | `/api/moderation/heatmap` | moderator, admin | Finer heatmap with alert flags |
| `GET` | `/api/manufacturer/batches` | manufacturer, admin | Manufacturer sees own batches only; admin sees all |

---

## 👥 Roles and Access Control

| Role | Can do |
|---|---|
| **Farmer / retailer** (no account) | Verify codes, submit reports, view the public hotspot map |
| **manufacturer** | View only their own batches (scoped by the id inside the signed token, never by the request) |
| **moderator** | Review reports, confirm or reject, view evidence and hotspots |
| **admin** | Everything above, plus user management and the audit log |

Hiding tabs in the UI is cosmetic. **Every endpoint enforces its role on the server.**

---

## 🛡 Security Design

- **Passwords:** bcrypt (cost 12), minimum 10 characters. Login returns the same error for a wrong email or a wrong password, and a dummy hash keeps response time similar so valid emails are not revealed.
- **Tokens:** access token (JWT, 15 minutes) and refresh token (random, 7 days, stored as a SHA-256 hash, **rotated on every use**). Reusing an old refresh token revokes all of that user's sessions.
- **Rate limiting:** global per-IP limit, tighter limits on login (5/min) and report submission (5/hour). In-memory for now.
- **Input validation:** Zod on every route; oversized or malformed input returns a structured 400.
- **Uploads:** file type is detected from the file's bytes (not its name or declared type), 5 MB limit, 3 files max, random filenames, and files are served only to staff with `nosniff` and `no-store` headers.
- **Headers and CORS:** Helmet enabled; CORS limited to `FRONTEND_ORIGIN`.
- **Proxy trust:** `TRUST_PROXY` must be an exact hop count. Trusting every `X-Forwarded-For` would let clients bypass IP rate limits.
- **Audit log:** records logins, failed logins, logouts, refresh-reuse detection, user creation/deactivation and report decisions.
- **Frontend tokens:** access token held in memory, refresh token in `sessionStorage`; refresh calls are serialized so two parallel requests cannot trigger reuse detection.

---

## 🔒 Privacy Design

- Verification needs **no account**.
- Each check stores the code, time and result, used only to detect copied packets.
- **Location is opt-in and off by default.** Report locations are rounded to roughly 1 km on the device before sending.
- Report contact details (phone or email) are optional and removed after 90 days (`npm run purge`).
- The **public heatmap** shows only coarse cells (about 11 km) that pass a minimum-report threshold, never exact places.
- Users can delete all data saved on their phone (offline queue and preferences) from the Privacy screen.

---

## 🧪 Testing and Evaluation

### Test suites

| Suite | Count | Result |
|---|---|---|
| Backend unit tests (`npm test`) | 25 | ✅ all pass |
| Backend integration tests (`npm run test:int`) | 15 | ✅ all pass |
| Frontend tests (`npm test` in `frontend/`) | 5 | ✅ all pass |
| **Total** | **45** | ✅ |

### Verdict engine evaluation (`npm run evaluate`)

| Metric | Result |
|---|---|
| Total cases | 66 |
| Overall accuracy | 100.0% |
| Normal subset | 100.0% (41 cases) |
| Adversarial subset | 100.0% (25 cases) |
| False positives (genuine not returned as `verified`) | 0 / 32 (0.0%) |
| False negatives (bad package returned as `verified`) | 0 / 28 (0.0%) |
| Server-side latency | p50 5.8 ms, p95 9 ms, max 66.8 ms |

**Dataset:** verified 32, expired 6, recalled 3, invalid 13, unverified 6, suspicious 4, confirmed counterfeit 2.

**How to read these numbers honestly**

- The data is **synthetic**, and the test cases were designed alongside the rules. The results show the rules behave as designed. They are **not** a claim of real-world accuracy.
- The false-negative set excludes `unverified`, because that verdict never claims a product is genuine.
- Latency is measured on the engine with scan recording off. It excludes network time and the database write for recording a scan.
- The harness exits with an error if accuracy drops below 95% or any bad package passes as `verified`, so rule changes cannot silently break detection.

### Load test (full endpoint)

| Setting | Result |
|---|---|
| Command | `autocannon -m POST -c 20 -d 20` against `/api/verify` with an invalid code |
| Requests/sec | _add your result_ |
| p95 latency | _add your result_ |

Reproduce it:

```bash
RATE_LIMIT_MAX=100000 npm run dev
npx autocannon -m POST -H content-type=application/json -b '{"code":"hello"}' -c 20 -d 20 http://localhost:3000/api/verify
```

Do not load-test with a valid code, because every call records a scan.

---

## 🖼 Screenshots

| Home | Verified | Suspicious |
|---|---|---|
| ![Home](docs/screenshots/home.png) | ![Verified](docs/screenshots/verified.png) | ![Suspicious](docs/screenshots/suspicious.png) |

| Language switch | Report form | Moderation queue |
|---|---|---|
| ![Marathi](docs/screenshots/marathi.png) | ![Report](docs/screenshots/report.png) | ![Moderation](docs/screenshots/moderation.png) |

| Hotspots | Swagger |
|---|---|
| ![Hotspots](docs/screenshots/hotspots.png) | ![Swagger](docs/screenshots/swagger.png) |

---

## ⚠️ Known Limitations

- Built and evaluated **locally on synthetic data**; not deployed publicly. HTTPS, reverse-proxy configuration, production secrets and monitoring are untested.
- Phone camera scanning needs HTTPS, so camera scanning was demonstrated on a laptop webcam via `localhost`.
- A valid code does not prove the contents are genuine.
- A deactivated user's access token stays valid for up to 15 minutes (no refresh is possible afterwards).
- Offline queued scans are recorded when replayed, carry no location, and may be double-counted if a response was lost.
- Verdict reason text comes from the server in English only. Hindi and Marathi text has not been reviewed by native speakers.
- Evidence images are stored on local disk; duplicate-report detection matches the exact code only.
- Confirmed reports do not yet automatically change a code's verdict to `confirmed_counterfeit`.
- Batches are created by seeding; there is no batch-creation UI.
- Rate limiting is in-memory (single instance only).

---

## 🔭 Future Scope

- Real manufacturer onboarding and a batch-creation UI with signed QR generation
- Linking confirmed reports to verdicts automatically
- Public deployment with HTTPS, monitoring and backups
- Object storage for evidence images; Redis-backed rate limiting
- Native-speaker review of Hindi and Marathi text; translated reason codes
- Hash-chained (tamper-evident) audit log
- OCR for printed codes
- Evaluation with real field data

---

## 👤 Author

**Harman Saini**
B.Tech student, Symbiosis Institute of Technology, Nagpur

- GitHub: [@Harman saini83](https://github.com/Harmansaini83)
- Email: [harmanajitsinghsaini16@gmail.com]

---

## 📄 License

Released under the MIT License. See [LICENSE](LICENSE) for details.
Developed as an academic project. Not intended for production use without a full security review.

---

*Remember: a valid code never proves a product is physically genuine.*
