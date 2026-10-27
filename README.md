# AI Tutor — Rule-Based Learning Chatbot

A guided training chatbot for gold-loan / BFSI branch staff. Learners work through topics made of
sub-topics, fact cards and multiple-choice checks, with progress tracking and resume. There is
**no LLM, no RAG and no AI model**: every reply comes from a state graph that admins author through
CSV upload or the admin panel and that is stored in PostgreSQL.

## Recent updates

- **Backend rewritten from Node/Express to Java/Spring Boot** (`backend-java/`), for the team now
  maintaining this project. Behaviorally identical — same routes, same JSON shapes, same CSV
  format, same FSM logic, same PostgreSQL schema — so the React frontend and the admin panel needed
  no changes. The old Node backend (`backend/`) is kept in the repo until the Java version is fully
  verified in production, then removed. See `backend-java/README.md`.
- **VPS deployment runs on PostgreSQL**, not SQLite — all published content and learner progress
  live in Postgres, persisted via a Docker named volume so nothing is lost on redeploy. There is no
  SQLite anywhere in the codebase — only a few code comments reference the old behavior for
  context.
- Fixed three bugs surfaced by that migration: `crypto.randomUUID()` failing on the non-HTTPS VPS
  deployment, a `pg` Postgres timestamp coming back as a `Date` object instead of a string, and
  `npm ci` failing on Linux because of a Windows-generated lockfile (switched to `npm install`).
- **Redesigned the MCQ answer flow** — answering now keeps the same card on screen with choices
  locked (correct in green, a wrong pick in red), the explanation below, and a small "Continue"
  button, instead of swapping to a separate feedback screen.
- **Added rich content support** — `**bold**` text and images (`![alt](url)` or a bare image URL)
  in Q&A content, with a typewriter-safe reveal so partial markdown never flashes on screen.
- **Added the `Type` column** (`Q`/`MCQ`/`GREETING`/`OVERVIEW`) so a topic's Greeting/Overview intro
  auto-chains into its real sub-topic menu, driven by an explicit column instead of guessing from
  sub-topic names.
- Combined the separate `HANDOVER.md`/`FEATURES.md` notes into this README as single-source
  documentation.

## Contents

- [Repository layout](#repository-layout)
- [Quick start (Docker Compose)](#quick-start-docker-compose)
- [Deploying on your own infrastructure](#deploying-on-your-own-infrastructure)
- [Moving content to a new server](#moving-content-to-a-new-server)
- [Content format (CSV)](#content-format-csv)
- [Local development without Docker](#local-development-without-docker)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Known limitations](#known-limitations)

## Repository layout

| Path | What it is |
|---|---|
| `backend-java/` | **Active backend** — Java/Spring Boot REST API + FSM conversation engine. Same routes/JSON/CSV format as the old Node backend. See `backend-java/README.md`. |
| `backend/` | Legacy Node.js/Express backend, kept only until the Java rewrite is fully verified in production. Its `public/admin.html`/`admin.js` are still the live admin panel (copied into the Java build, unmodified). |
| `frontend/` | React + Vite chat UI for learners. |
| `backend-java/Dockerfile` | Multi-stage build: builds the frontend, builds the Spring Boot jar, packages both into one runtime image. |
| `docker-compose.yml` | Runs that image (`app`) plus a Postgres 16 container (`db`) with a persistent volume. |

The `app` container is one Spring Boot process on one port. It serves the API, the built React app,
and the admin panel, so there is no separate frontend server and no CORS setup.

## Quick start (Docker Compose)

```
cp .env.example .env
```

Edit `.env` and set `POSTGRES_PASSWORD`. **Use letters and digits only** — special characters break
the database connection string. Then:

```
docker compose up -d --build
```

- Learner app: `http://localhost:4000` (or `http://SERVER_IP:4000`)
- Admin panel: `http://localhost:4000/admin.html`

The database starts empty — publish content from the admin panel using a CSV (see
[Content format](#content-format-csv) below).

**Changing the port**: set `APP_PORT` in `.env` (e.g. `APP_PORT=8080`), run `docker compose up -d`,
and open that port in your server firewall. The app still listens on 4000 inside the container.

**Where the data lives**: published content and all learner progress are stored in Postgres, in the
Docker named volume `db_data`. The app container itself holds no data and can be rebuilt freely.

- `docker compose up -d --build` — rebuild and restart; data is kept.
- `docker compose down` — stop everything; data is kept.
- `docker compose down -v` — stop everything **and delete the volume (all data)**.
- `POSTGRES_PASSWORD` only takes effect the first time the volume is created — changing it later in
  `.env` does not change the password already stored in an existing volume. To rotate it, you must
  `down -v` and recreate (destroys existing data, so only do this before real data exists).

Back up regularly:

```
docker compose exec db pg_dump -U app ai_tutor > backup.sql
```

**Useful commands**:
- `docker compose logs -f app` — follow the app logs.
- `docker compose exec db psql -U app -d ai_tutor` — open a psql shell on the live database.
- `docker compose restart app` — restart only the app; Postgres and its data are untouched.

## Deploying on your own infrastructure

Nothing in the code is tied to any particular host — pick whichever fits your infrastructure.

| Situation | What to do |
|---|---|
| You use Docker | As above: `.env` + `docker compose up -d --build`. |
| You already run Postgres (managed/cloud) | Skip the `db` service. Point `DATABASE_URL` (on the `app` service, or in `backend/.env` if not using Docker) at your own connection string. The app creates its own tables on first boot (`backend/src/db/schema.sql`, idempotent). |
| No Docker | Node.js 22+. `cd backend && npm install`, `cd frontend && npm install && npm run build`, copy `frontend/dist/*` into `backend/public/`, then `node backend/src/server.js` with `DATABASE_URL` set. |
| Custom domain / HTTPS | Put a reverse proxy (Caddy, nginx) in front of whatever port the app binds to — the app has no HTTPS logic of its own and needs no changes. |

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | root `.env` (Docker only) | Credentials for the `db` container. Plain alphanumeric password only. |
| `APP_PORT` | root `.env` (Docker only) | The port the app is reachable on from outside the container (maps to the app's internal port 4000). |
| `DATABASE_URL` | `backend/.env` (non-Docker) or set directly on the `app` service | Full Postgres connection string, e.g. `postgresql://user:pass@host:5432/dbname`. |
| `PORT` | `backend/.env` (non-Docker) | Port the Express server listens on. Defaults to 4000. |
| `VITE_API_BASE_URL` | frontend build-time env | Leave empty (`""`) when frontend and backend share one origin (the normal Docker setup). Set to a full URL only if they're served from different origins. |

## Moving content to a new server

A fresh database starts empty (a bare app chassis, zero topics). Two ways to populate it:

1. **Simplest — republish from source CSVs.** Get the original CSV sheets (columns below), open
   `/admin.html` on the new server, and use Publish. Recommended — clean, no learner-progress
   baggage.
2. **Exact copy, including learner progress.** From the old server:
   `docker compose exec db pg_dump -U app ai_tutor > backup.sql`. Restore on the new server with
   `psql`. Only worth it if historical learner progress actually matters.

## Content format (CSV)

Each row is one screen: `Topic`, `Sub-Topic`, `Type`, `#`, `Question`, `Choice A`–`D`, `Correct`,
`Answer/Explanation`. `Type` is one of:

| Type | Behavior |
|---|---|
| `Q` | Fact card — question + answer shown together |
| `MCQ` | Graded multiple-choice, up to 3 attempts, locked-card reveal after answering |
| `GREETING` | Same as `Q`, but auto-plays first when the topic is opened |
| `OVERVIEW` | Same as `Q`, but auto-plays right after `GREETING`, before the real sub-topic menu |

`**bold**` markdown and images (`![alt](url)`, or a bare image URL on its own line) are supported in
Question/Answer/Choice text. Self-host images under `frontend/public/images/` rather than
hotlinking — some hosts (e.g. Google Drive) block embedding.

Full column list, validation rules, and the admin CRUD grid are documented in `backend/README.md`.

## Local development without Docker

You need a PostgreSQL you can reach (the `db` service in `docker-compose.yml` is not exposed on the
host by default — use your own instance, or add a `ports: ['5432:5432']` mapping to it for local
work).

- Backend: `cd backend && npm install`, copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`, then `npm run dev`. See `backend/README.md`.
- Frontend: `cd frontend && npm install && npm run dev`. It calls the backend at `http://localhost:4000` by default; set `VITE_API_BASE_URL` to point elsewhere.

## Features

### Admin

- **Bulk content upload via CSV** — Preview validates without writing; Publish writes in a single
  database transaction, validating the *entire* resulting content first, so a bad upload can never
  leave the app half-broken. Duplicate state IDs (e.g. two sub-topics normalizing to the same name)
  are caught and reported clearly.
- **Automatic content cleanup on upload** — recovers lost "₹" signs and mangled em/en dashes from
  Excel-exported CSVs automatically.
- **Rich content** — `**bold**` text, and images via `![alt](url)` or a bare image URL on its own
  line.
- **Topic intro chaining** — `GREETING`/`OVERVIEW` rows auto-play in order when a topic is first
  opened, then hand off to the real sub-topic menu; repeat visits skip straight to the menu.
- **Download / export content** — any topic's current content downloads as a CSV in the same format
  Publish accepts, for offline bulk edits. Matching happens by Topic name, not filename.
- **Full CRUD admin grid** — browse Topics → Sub-Topics → Questions, add/edit/delete one record at
  a time. A sub-topic can be created empty and filled in later. Works alongside the CSV path — CSV
  for bulk authoring, the grid for one-off changes — and reuses the exact same validated,
  rollback-safe publish pipeline.

### Learner

- **Personal greeting** — asks for the learner's name once, then greets by time of day every visit.
- **Progress dashboard** — overall % complete, a green bar per topic ("3/6 topics · 50%"), and a
  real-count bar per sub-topic ("6/15 covered · 40%").
- **Resume where you left off** — reopening the app continues exactly where the learner stopped. An
  already-finished topic reopened the next day instead offers a short reinforcement quiz.
- **Feels like a real conversation** — taps/answers appear as the learner's own sent message, with
  the bot's reply underneath. A breadcrumb ("Gold Loan › LTV Ratio, Valuation & Interest Rates")
  always shows where the learner is.
- **Question & Answer browsing** — questions shown one at a time with Previous/Next; the last one's
  "Next" becomes "Continue," handing off to the graded quiz.
- **Graded quiz (MCQs)** — up to 3 attempts each. After answering, the same card stays on screen
  with choices locked: correct in green, a wrong pick in red, explanation below, and a small
  "Continue" button bottom-right.
- **Always-available navigation** — "Back to Topic Menu" and "Main Menu" on every screen.

## Tech stack

### Backend (`/backend-java`)

- **Java 17 + Spring Boot 3** — the whole API (`/chat`, `/modules`, `/progress`, `/quiz`, `/admin`),
  plain REST, JSON in/out. Built with Maven.
- **Spring Data JPA / Hibernate** over **PostgreSQL 16** — stores users, progress, quiz attempts,
  sub-topic completion, item-level progress, **and** the course content.
- Course content lives in the `conversation_files` table (one JSONB row per former JSON file,
  mapped via Hibernate's native JSON support), loaded into an in-memory cache at boot and swapped
  atomically after each publish — no restart needed. A baseline chassis (no topics) is seeded from
  `backend-java/src/main/resources/conversations-seed/` only when the table is empty.
- **Apache Commons CSV** for CSV uploads.
- No ORM-generated business logic, no template engine — the whole conversation state machine is a
  hand-rolled `FsmEngine` (direct port of the original Node `fsmEngine.js`), not an LLM.
- Previously Node.js/Express (`backend/`, kept in the repo until the Java version is fully verified
  in production — see "Recent updates" above). The rewrite is a behavioral port, not a redesign:
  same routes, same JSON shapes, same CSV format, same Postgres schema.

### Frontend (`/frontend`)

- **React 19 + Vite** — the learner-facing chat-bubble dashboard.
- Plain CSS (`styles.css`/`index.css`) — no Tailwind, no component library, hand-written design
  tokens (light/dark theme via CSS custom properties).
- No state library — a single `useAppState` hook plus fetch-based API calls (`api/chatApi.js`) is
  the whole data layer.
- **oxlint** for linting.

### Admin panel

Plain HTML/CSS/vanilla JS (`backend/public/admin.html` + `admin.js`, unchanged by the backend
rewrite) — no framework, no build step, served directly as a static resource by Spring Boot.

### Why not Python?

This project doesn't play to Python's strengths — no ML, no data science, no numerical work — so it
wasn't rejected for a technical shortcoming. The frontend was always going to be React, so building
the backend in JavaScript too means one language and one JSON-native data flow end-to-end. The app's
actual shape — a stream of small, fast request/response cycles, nothing CPU-heavy — fits Node's
event loop well; a rule-based FSM answering "what's the next state" is I/O-bound, not compute-bound.
FastAPI + Python's built-in `sqlite3`/`csv` would have worked fine too — it just wasn't the path of
least friction given the frontend was already decided as React.

## Known limitations

Read this before exposing the app beyond a private network or internal test:

- **The admin panel (`/admin.html`) has no authentication.** Anyone who can reach it can publish or
  delete content. Restrict network access to it, or add a login, first.
- **No HTTPS built in** — needs a reverse proxy in front for a domain/TLS.
- **No automated database backups** — set up your own scheduled `pg_dump`.
- **No real learner accounts** — a learner is identified by a name typed once plus an ID stored in
  the browser (`localStorage`), not a login.
- **No automated tests.**
- **No supervisor/manager dashboard** — each learner only sees their own progress.
- **No estimated time-to-complete** shown to learners.
- **No automated reminders** (e.g. WhatsApp) for learners who've stalled.
