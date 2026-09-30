# AI Tutor — Handover Guide

This app is a **rule-based FSM training chatbot** for gold-loan/BFSI branch staff. There is no
LLM, no RAG, no AI model — every reply comes from a state graph authored through CSV and stored
in Postgres. See `README.md` and `backend/README.md` for the full setup reference; this file is
the shorter path for a new team taking the project over.

## What you're getting

- `backend/` — Node.js/Express REST API + the FSM conversation engine + the admin panel (`public/admin.html`)
- `frontend/` — React/Vite chat UI
- `Dockerfile` + `docker-compose.yml` — packages both into one container, plus a Postgres container
- No LLM/AI dependency, no external API keys required

**Not included in this repo:** any published content (topics/questions) or learner progress —
both live only in a database, not in git. See "Moving content to your server" below.

## Deployment options

Pick whichever fits your infrastructure — nothing in the code assumes a particular host.

| Situation | What to do |
|---|---|
| You use Docker | Copy `.env.example` to `.env`, set a plain alphanumeric `POSTGRES_PASSWORD`, run `docker compose up -d --build`. |
| You already run Postgres (managed/cloud) | Skip the `db` service. Set `DATABASE_URL` on the `app` service (or in `backend/.env` if not using Docker) to your own connection string. The app creates its own tables on first boot (`backend/src/db/schema.sql`, idempotent). |
| No Docker | Node.js 22+. `cd backend && npm install`, `cd frontend && npm install && npm run build`, copy `frontend/dist/*` into `backend/public/`, then `node backend/src/server.js` with `DATABASE_URL` set. |
| Custom domain / HTTPS | Put a reverse proxy (Caddy, nginx) in front of whatever port the app binds to. The app itself needs no changes — it has no HTTPS logic of its own. |

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | root `.env` (Docker only) | Credentials for the `db` container. **Use a plain alphanumeric password** — special characters can break the connection string. |
| `APP_PORT` | root `.env` (Docker only) | The port the app is reachable on from outside the container (maps to the app's internal port 4000). |
| `DATABASE_URL` | `backend/.env` (non-Docker) or set directly on the `app` service | Full Postgres connection string, e.g. `postgresql://user:pass@host:5432/dbname`. |
| `PORT` | `backend/.env` (non-Docker) | Port the Express server listens on. Defaults to 4000. |
| `VITE_API_BASE_URL` | frontend build-time env | Leave empty (`""`) when frontend and backend share one origin (the normal Docker setup). Set to a full URL only if they're served from different origins. |

**Docker persistence rule:** the Postgres named volume (`db_data`) is the only thing that must
survive redeploys. `docker compose down` keeps it; only `docker compose down -v` deletes it.
Changing `POSTGRES_PASSWORD` after the volume already exists has no effect — Postgres only sets
credentials once, on a genuinely empty data directory.

## Moving content to your server

The database starts empty (a bare app chassis, zero topics). Two ways to populate it:

1. **Simplest — republish from source CSVs.** Ask for the original CSV sheets (Topic, Sub-Topic,
   Type, #, Question, Choice A–D, Correct, Answer/Explanation columns). Open `/admin.html` on the
   new server and use Publish. This is the recommended path — clean, no learner-progress baggage.
2. **Exact copy, including learner progress.** From the old server:
   `docker compose exec db pg_dump -U app ai_tutor > backup.sql`. Restore on the new server with
   `psql`. Only do this if keeping historical learner progress actually matters.

## Content format (CSV)

Each row is one screen. `Type` is one of:

| Type | Behavior |
|---|---|
| `Q` | Fact card — question + answer shown together |
| `MCQ` | Graded multiple-choice, up to 3 attempts, locked-card reveal after answering |
| `GREETING` | Same as `Q`, but auto-plays first when the topic is opened |
| `OVERVIEW` | Same as `Q`, but auto-plays right after `GREETING`, before the real sub-topic menu |

`**bold**` markdown and images (`![alt](url)`, or a bare image URL on its own line) are supported
in Question/Answer/Choice text. Self-host images under `frontend/public/images/` rather than
hotlinking — some hosts (e.g. Google Drive) block embedding.

Full column list, validation rules, and the admin CRUD grid are documented in `backend/README.md`.

## Known gaps — read before going live

- **`/admin.html` has no authentication.** Anyone who can reach it can publish or delete content.
  Restrict network access to it, or add a login, before exposing this beyond internal testing.
- No HTTPS built in — needs a reverse proxy if going outside a private network.
- No automated database backups — set up your own scheduled `pg_dump`.
- Learner identity is just a name typed once, stored client-side — no real accounts/login.
- No automated tests yet.
- No supervisor/manager dashboard (each learner only sees their own progress).

## Reference docs

- `README.md` — architecture summary and Docker Compose quick start
- `backend/README.md` — API endpoints, data model, admin/CSV pipeline detail
- `FEATURES.md` — full feature list (admin + learner-facing) and current tech stack
