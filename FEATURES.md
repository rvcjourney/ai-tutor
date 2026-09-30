# AI Tutor — Feature Notes (Admin + User)

## Admin features

### 1. Bulk content upload via CSV
- Paste or upload a CSV (`Topic`, `Sub-Topic`, `Type`, `#`, `Question`, `Choice A`–`D`, `Correct`, `Answer/Explanation`).
- **Preview** validates the file and shows what would be published (topic, sub-topics, question/MCQ counts) without writing anything.
- **Publish** writes it live in a single database transaction. The whole resulting content is validated *before* anything is written, and if anything fails the transaction rolls back. A bad upload can never leave the app half-broken.
- Duplicate state IDs (e.g. two sub-topics that normalize to the same name, like "Career Growth & Skills" vs "Career Growth and Skills") are caught at publish and reported clearly.

### 2. Automatic content cleanup on upload
- Fixes CSVs exported from Excel with broken encoding: recovers lost "₹" signs and mangled em/en dashes automatically, no manual find-replace needed.

### 2b. Rich content in answers/questions
- `**bold**` text is supported.
- Images: write `![alt](url)`, or just paste a bare image URL on its own line. Self-hosted images go in `frontend/public/images/` and are referenced as `/images/<file>` (hotlinked hosts like Google Drive often block embedding).

### 2c. Topic intro chaining via the Type column
- `Type` can be `Q`, `MCQ`, `GREETING` or `OVERVIEW`. `GREETING` and `OVERVIEW` rows auto-play in order when a topic is first opened, then lead into the real sub-topic menu. Repeat visits skip straight to the menu.

### 3. Download / export content
- Any topic's current content can be downloaded as a CSV in the same format Publish accepts.
- Lets an admin do bulk edits offline in a spreadsheet, then re-upload to update that topic. Matching happens by the Topic name inside the file, not the filename.

### 4. Full CRUD admin grid (Topics → Sub-Topics → Questions)
- A proper admin panel: browse Topics, drill into a Topic's Sub-Topics, drill into a Sub-Topic's Questions.
- Add / Edit / Delete at all three levels, one record at a time — no need to touch a spreadsheet for a single fix.
- A sub-topic can be created empty and filled in with questions afterward.
- Works alongside the CSV path, not instead of it — CSV for bulk authoring, the grid for quick one-off changes.
- Every single-record edit reuses the exact same validated, rollback-safe publish pipeline as the CSV path — no separate, less-safe write path.

## User (learner) features

### 1. Personal greeting
- Asks for the learner's name once, then greets "Good Morning / Afternoon / Evening, [Name]!" based on time of day, every time they open the app.

### 2. Progress dashboard
- Top of screen always shows overall % complete — moves as soon as any progress is made, not only when a full sub-topic is finished.
- Each topic shows a green completion bar ("3/6 topics · 50%").
- Each sub-topic (once inside a topic) also shows its own green bar with a real count ("6/15 covered · 40%").

### 3. Resume where you left off
- Closing the app mid-course and coming back continues exactly where the learner stopped — no restart.
- Returning the next day to an already-finished topic instead offers a short reinforcement quiz before going back to the main menu.

### 4. Feels like a real conversation
- Answering a question or picking an MCQ option shows as the learner's own sent message, with the bot's reply appearing underneath — like a real chat, without keeping any scroll-back history.
- A breadcrumb ("Gold Loan › LTV Ratio, Valuation & Interest Rates") shows where the learner is at all times.

### 5. Question & Answer browsing
- Inside a sub-topic, questions are shown one at a time as a conversation, with Previous/Next to move around freely.
- The last question's "Next" becomes "Continue", which hands off into the graded quiz for that sub-topic.

### 6. Graded quiz (MCQs)
- Multiple-choice questions, up to 3 attempts each.
- After answering (correct, or attempts used up), the same card stays on screen with the choices locked: correct answer in green, a wrong pick in red, the explanation below, and a small "Continue" button at the bottom right for the next question.
- Clear correct/incorrect feedback, distinct from a normal reply.

### 7. Always-available navigation
- "Back to Topic Menu" and "Main Menu" are shown on every single screen, so the learner is never stuck or lost.

## Not yet built (open items)

- Estimated time left to finish the course (e.g. "~15 minutes left").
- Automated WhatsApp reminders to bring back learners who've stalled.
- A supervisor/manager view showing all learners' progress at once (today, each learner only sees their own).
- Automated tests.
- Admin login: `/admin.html` currently has no authentication, so anyone who can reach the URL can publish or delete content.
- HTTPS / domain (today it runs on plain `http://ip:port`).
- Automated database backups (the Docker volume `db_data` is the only copy of the data).
- Real learner accounts (today a learner is identified by a name typed once plus an ID stored in the browser).

## Tech stack

Straight from the two `package.json` files.

### Backend (`/backend`)

- **Node.js + Express** — the whole API (`/chat`, `/modules`, `/progress`, `/quiz`, `/admin`), plain REST, JSON in/out.
- **PostgreSQL 16** via the `pg` package (connection pool, `DATABASE_URL`) — stores users, progress, quiz attempts, sub-topic completion, item-level progress, **and** the course content. (Originally `node:sqlite` + JSON files on disk; migrated because Render's free tier has no persistent storage.)
- Course content (topics/sub-topics/questions) lives in the `conversation_files` table (one JSONB row per former JSON file), loaded into an in-memory `Map` at boot and swapped live after each publish — no restart needed. A baseline chassis (no topics) is seeded from `backend/src/conversations-seed/` only when the table is empty.
- **csv-parse** — parses the admin's CSV uploads.
- **cors, dotenv** — standard middleware/config.
- **nodemon** (dev only) — auto-restart on file changes.
- No ORM, no template engine — the whole conversation logic is a hand-rolled finite-state-machine engine (`fsmEngine.js`), not an LLM.

### Frontend (`/frontend`)

- **React 19 + Vite** — the learner-facing chat-bubble dashboard.
- Plain CSS (`styles.css`/`index.css`) — no Tailwind, no component library, hand-written design tokens (light/dark theme via CSS custom properties).
- No state library — a single `useAppState` hook plus fetch-based API calls (`api/chatApi.js`) is the whole data layer.
- **oxlint** for linting.

### Admin panel

Plain HTML/CSS/vanilla JS (`backend/public/admin.html` + `admin.js`) — no framework, no build step, served directly as a static file by the Express backend.

### Deployment

Docker Compose on a VPS — two containers: `app` (one Express process serving the API, the built React app, and the admin panel on port 4000) and `db` (`postgres:16-alpine` with the named volume `db_data`, which is what makes data survive redeploys). Built from a single multi-stage `Dockerfile`. Redeploy = `git pull`, then `docker compose up -d --build`. `docker compose down -v` is the only command that deletes the data.

(Previously on Render's free tier, which has ephemeral disk and no persistent storage.)

Notably absent, by design: no LLM, no vector DB, no RAG — the "AI Tutor" name refers to the guided/conversational UX, not the underlying logic, which is a deterministic rule-based FSM authored entirely through CSV/the admin grid.

### Why not Python?

This project doesn't do anything that plays to Python's strengths — no ML, no data science, no numerical work — so it wasn't rejected for a technical shortcoming. Node/Express was the more natural fit for a few concrete reasons:

- The frontend was always going to be React. Building the backend in JavaScript too means one language, one package manager (npm), one JSON-native data flow end-to-end — no context-switching between two ecosystems, no serialization mismatches between a Python backend's types and a JS frontend's types.
- The app's actual shape fits Node's model well: it's a stream of small, fast request/response cycles (one chat turn = one request), nothing CPU-heavy, nothing that blocks — exactly what Node's event loop is built for. A rule-based FSM answering "what's the next state" is I/O-bound, not compute-bound.
- Nothing here needed Python specifically. If this were doing text embeddings, ML-based grading, or heavy data analysis, Python's ecosystem (numpy, pandas, scikit-learn, etc.) would have been the obvious pull. This is deliberately not that — it's a deterministic FSM, so that pull never existed.

To be fair to Python: it would have worked completely fine here too — FastAPI + Python's built-in `sqlite3` + `csv` module would have handled this app's actual requirements just as well, with a React frontend talking to it over REST like any other backend. It's a legitimate alternative, not one to argue against if preferred — it just wasn't the path of least friction given the frontend was already decided as React.
