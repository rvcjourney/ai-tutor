# Rule-Based Learning Chatbot — Backend

Config-driven FSM conversation engine + REST API. No LLM/RAG/AI — every response comes from the JSON conversation graphs in `src/conversations/`.

## Setup

```
npm install
copy .env.example .env    # (cp on mac/linux)
npm run dev
```

Server listens on `PORT` (default 4000). SQLite file is created at `DB_PATH` (default `./data/chatbot.db`) via Node's built-in `node:sqlite` module — no native build step required.

> Note: the original plan called for `better-sqlite3`, but this machine has no Visual Studio Build Tools for its native compile step. Swapped to Node's built-in `node:sqlite` (stable API-compatible subset, no native deps). If a real VS/build-tools setup becomes available and a Postgres-style richer driver is wanted later, swapping `src/db/index.js` is the only place that needs to change — `better-sqlite3` and `node:sqlite` share the same `prepare().run()/.get()/.all()` shape the repositories use.

## API

- `POST /chat/start` `{ userId, simulateNextDay? }` — creates/resumes a session.
- `POST /chat/message` `{ userId, input }` — `input` is an option `id` for menu states or free text for quiz/input states.
- `POST /quiz/submit` `{ userId, answer }` — alias for `/chat/message`, but 400s if the learner isn't currently on a quiz state.
- `GET /modules` — the 8 top-level topics and which are available.
- `GET /progress?userId=` — current state, last completed state, module, status.
- `POST /admin/import` `{ csv }` — publishes a new/updated topic from CSV (see below). `POST /admin/preview` validates without publishing. `POST /admin/delete` `{ moduleId }` removes a topic. **No authentication** — anyone who can reach these routes can add/remove content; fine for local dev, revisit before sharing the deployed URL.

## Adding a new topic

**By hand:** drop a new `src/conversations/<topic>.json` file with `{ "states": [...] }` (see `main.json` for the node shape: `type: menu|auto|input|quiz|mcq|exit`). Point the relevant `MAIN_MENU` option's `next` at your entry state instead of `COMING_SOON`, and flip that topic to `available: true` in `modules-registry.json`. No engine code changes needed — `conversationLoader.js` auto-discovers every `*.json` file in that directory and validates all `next`/`option.next`/`quiz.on*`/`correctOptionId` references at boot (fails fast with a clear error if something's misspelled).

**From a CSV (admin pipeline):** open `/admin.html` — it lists current topics (with delete buttons) and has a form to paste or upload a CSV with columns `ID, Topic, Sub-Topic, Type (Q/MCQ), #, Question, Choice A-D, Correct, Answer/Explanation, Notes`. Use **Preview** to validate and see what will be created without publishing, then **Publish** to go live. This calls `POST /admin/import` (`src/admin/csvImporter.js` + `src/admin/publishService.js`), which generates the topic's states (each `Q` row becomes a paced "fact" state pairing the question with its answer; each `MCQ` row becomes a graded `mcq` state with up to 3 retries before revealing the answer), writes the module JSON file, and upserts `modules-registry.json` + `MAIN_MENU`'s options in `main.json` — then hot-reloads the live engine (`conversationLoader.reload()`) without a server restart. If anything is wrong with the sheet (a missing `Correct` value, an empty question, etc.), the whole publish is rejected with a row-by-row error and **nothing is written** — a bad sheet can never leave the app broken.

## Data model

- FSM graph (states, transitions, quiz rules) → JSON, source of truth, git-diffable.
- SQLite → only per-user state: `users`, `user_progress` (current/last-completed state, module, status), `quiz_attempts` (answer log, used for retry counting).
