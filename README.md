# AI Tutor — Rule-Based Learning Chatbot

- `backend/` — Node/Express FSM engine + REST API + admin panel. See `backend/README.md`.
- `frontend/` — Vite + React chat UI.
- Both are packaged into one Docker image (see `Dockerfile`) that serves the API, the built React app, and the admin panel from a single Express process/port — plus a Postgres container for storage. This is the deployment path in active use; see below.

## Running locally or on a VPS (Docker Compose)

```
cp .env.example .env    # fill in a real POSTGRES_PASSWORD
docker compose up -d --build
```

That's it — `docker compose` builds the app image (frontend build → copied into the backend's static files) and starts it alongside a Postgres container. The app is reachable at `http://localhost:${APP_PORT:-4000}` (or `http://YOUR_VPS_IP:4000` on a server), and the admin panel at the same host's `/admin.html`.

**Why Docker Compose, not Render**: everything the app writes — published topic content and every learner's progress — now lives in Postgres, persisted via a named volume (`db_data`, declared in `docker-compose.yml`). That volume is what survives `docker compose down`/`up`, container restarts, and redeploys — the actual problem this setup solves. Render's free tier has no persistent disk at all and its free Postgres self-destructs after 30 days, so it isn't a viable target for this app's storage model. If you deploy anywhere else, the one requirement is: wherever `db_data` (Postgres's data directory) lives has to be genuinely persistent, not a disposable container filesystem.

**No domain configured** — this setup runs on plain `ip:port`, no HTTPS/reverse proxy. If you add a domain later, put a reverse proxy (e.g. Caddy, for automatic HTTPS) in front of the `app` service; nothing about the app itself needs to change.

**Useful commands**:
- `docker compose logs -f app` — tail the app's logs.
- `docker compose exec db psql -U app -d ai_tutor` — open a psql shell against the live database.
- `docker compose restart app` — restart just the app (Postgres, and its data, are untouched).
- `docker compose down` — stop everything; the volume (and all your data) stays. Only `docker compose down -v` removes it.

## Local development without Docker

Useful for iterating on either side individually with hot reload — you still need a real Postgres reachable somewhere (e.g. `docker compose up -d db` to run just the database container, then point `DATABASE_URL` at `localhost:5432`).

- Backend: `cd backend && npm install && npm run dev` (see `backend/README.md` for env setup).
- Frontend: `cd frontend && npm install && npm run dev` (defaults to calling the backend at `http://localhost:4000`; override with `VITE_API_BASE_URL` if needed).
