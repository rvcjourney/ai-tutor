# AI Tutor — Rule-Based Learning Chatbot

Two independent projects, deployed as separate Render services from this one repo:

- `backend/` — Node/Express FSM engine + REST API (SQLite via `node:sqlite`). See `backend/README.md`.
- `frontend/` — Vite + React chat UI.

## Deploying on Render

**Backend** — New Web Service, root directory `backend`:
- Build command: `npm install`
- Start command: `npm start`
- Render sets `PORT` automatically; the app already reads `process.env.PORT`.
- No other env vars required for a first deploy (`DB_PATH` defaults to `./data/chatbot.db`, created at startup).
- Note: on Render's free instance type, the local SQLite file does not survive a redeploy or a spin-down-to-zero restart (no persistent disk on free tier) — fine for demoing, but for durable user progress you'd want a paid instance with a persistent disk, or to switch to a hosted Postgres later.

**Frontend** — New Static Site, root directory `frontend`:
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Env var (set before building): `VITE_API_BASE_URL` = the backend service's URL (e.g. `https://ai-tutor-backend.onrender.com`) — Vite bakes this in at build time, so it must be set before the build runs, not after.
