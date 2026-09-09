# Rule-Based Learning Chatbot — Backend

Config-driven FSM conversation engine + REST API. No LLM/RAG/AI — every response comes from conversation graphs (states, transitions, quiz rules) stored as JSON blobs in Postgres.

## Setup

Easiest: run the whole app via Docker Compose from the repo root (see the root `README.md`) — it starts Postgres for you and there's nothing to configure here.

To run the backend directly against your own Postgres instead:

```
npm install
copy .env.example .env    # (cp on mac/linux) — set DATABASE_URL to a real Postgres connection string
npm run dev
```

Server listens on `PORT` (default 4000). On first boot against an empty database, the schema is created automatically and conversation content is seeded from `src/conversations-seed/` (the empty app chassis — no topics yet, publish some via `/admin.html`).

## API

- `POST /chat/start` `{ userId, simulateNextDay? }` — creates/resumes a session.
- `POST /chat/message` `{ userId, input }` — `input` is an option `id` for menu states or free text for quiz/input states.
- `POST /quiz/submit` `{ userId, answer }` — alias for `/chat/message`, but 400s if the learner isn't currently on a quiz state.
- `GET /modules` — the 8 top-level topics and which are available.
- `GET /progress?userId=` — current state, last completed state, module, status.
- `POST /admin/import` `{ csv }` — publishes a new/updated topic from CSV (see below). `POST /admin/preview` validates without publishing. `POST /admin/delete` `{ moduleId }` removes a topic. **No authentication** — anyone who can reach these routes can add/remove content; fine for local dev, revisit before sharing the deployed URL.

## Adding a new topic

**From a CSV (admin pipeline):** open `/admin.html` — it lists current topics (with delete buttons) and has a form to paste or upload a CSV with columns `Topic, Sub-Topic, Type (Q/MCQ/GREETING/OVERVIEW), #, Question, Choice A-D, Correct, Answer/Explanation`. Use **Preview** to validate and see what will be created without publishing, then **Publish** to go live. This calls `POST /admin/import` (`src/admin/csvImporter.js` + `src/admin/publishService.js`), which generates the topic's states (each `Q` row becomes a paced "fact" state pairing the question with its answer; each `MCQ` row becomes a graded `mcq` state with up to 3 retries before revealing the answer) and, in one Postgres transaction, writes the module's row, and upserts `modules-registry.json` + `MAIN_MENU`'s options — then swaps the live in-memory cache to match, no server restart needed. The *entire* resulting content is validated before a single row is written — if anything is wrong (a missing `Correct` value, a dangling reference, an empty question, etc.), nothing is written at all and the whole publish is rejected with a clear error. The single-record CRUD endpoints under `/admin/topics/...` (add/edit/delete one sub-topic or question) go through the exact same validate-then-publish path.

**By hand:** there's no file to drop anymore — content lives in the `conversation_files` table (see Data model below). Use the admin CSV/CRUD path above, or `INSERT`/`UPDATE` a row directly if you really need to (each row is `{ filename, content }`, `content` being the exact same JSON shape a conversation file used to be — `{ "states": [...] }` or `{ "modules": [...] }`).

## Data model

Everything lives in Postgres now (`src/db/schema.sql`) — a Docker named volume (or your own Postgres install) is what makes it durable, not git or the local filesystem:

- `conversation_files` — the FSM graph (states, transitions, quiz rules) and the topic registry, one row per former JSON file, `content` as `jsonb`. Source of truth for everything `conversationLoader.js` loads into its in-memory cache at boot.
- Per-user state: `users`, `user_progress` (current/last-completed state, module, status), `quiz_attempts` (answer log, used for retry counting), `sub_topic_completions`, `sub_topic_item_progress`.
