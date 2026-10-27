# AI Tutor — Backend (Java / Spring Boot)

Config-driven FSM conversation engine + REST API. No LLM/RAG/AI — every response comes from
conversation graphs (states, transitions, quiz rules) stored as JSON blobs in Postgres. This is a
behavioral port of the original Node/Express backend (see the `main` branch) — same routes, same
JSON shapes, same CSV format, same Postgres schema — built for a team that maintains Java/Spring
Boot.

## Setup

Easiest: run the whole app via Docker Compose from the repo root (see the root `README.md`) — it
builds this service, starts Postgres, and there's nothing to configure here.

To run this backend directly against your own Postgres instead (useful for local development with
hot reload):

```
cd backend-java
mvn spring-boot:run \
  -Dspring-boot.run.jvmArguments="-DSPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/ai_tutor -DSPRING_DATASOURCE_USERNAME=app -DSPRING_DATASOURCE_PASSWORD=yourpassword"
```

(Or export `SPRING_DATASOURCE_URL` / `SPRING_DATASOURCE_USERNAME` / `SPRING_DATASOURCE_PASSWORD` as
environment variables instead of JVM args — either works.) You still need a real Postgres reachable
somewhere, e.g. `docker compose up -d db` from the repo root, then point at `localhost:5432`.

Server listens on `PORT` (default 4000). On first boot against an empty database, the schema is
created automatically (`src/main/resources/schema.sql`, idempotent) and conversation content is
seeded from `src/main/resources/conversations-seed/` (the empty app chassis — no topics yet, publish
some via `/admin.html`).

Requires Maven 3.9+ and Java 17+ if not using Docker. No Maven install needed if you generate the
Maven Wrapper (`mvn -N wrapper:wrapper`) and use `./mvnw` instead.

## API

- `POST /chat/start` `{ userId, displayName?, clientHour?, simulateNextDay? }` — creates/resumes a session.
- `POST /chat/message` `{ userId, input }` — `input` is an option `id` for menu states or free text for quiz/input states.
- `POST /quiz/submit` `{ userId, input }` — alias for `/chat/message`, but 400s if the learner isn't currently on a quiz state.
- `GET /modules` — the top-level topics and which are available.
- `GET /modules/{moduleId}/subtopics/{subTopicId}/qa` — the Q&A pairs for one sub-topic (never MCQs), for the two-pane explorer.
- `GET /progress?userId=` — current state, last completed state, module, status, and the full progress summary (per-module/per-sub-topic percentages, estimated minutes left).
- `POST /admin/import` `{ csv }` — publishes new/updated topics from a CSV. `POST /admin/preview` validates without publishing.
- `GET /admin/topics/{moduleId}` — a topic's content, reconstructed from the published state graph (admin grid view).
- `GET /admin/topics/{moduleId}/export` — downloads a topic as CSV, same format `/admin/import` accepts.
- `POST/PUT/DELETE /admin/topics/{moduleId}` — create/rename/delete a topic.
- `POST/PUT/DELETE /admin/topics/{moduleId}/subtopics/{subTopicId}` — create/rename/delete a sub-topic.
- `POST/PUT/DELETE /admin/topics/{moduleId}/subtopics/{subTopicId}/questions/{index}` — create/update/delete one question. All single-record CRUD routes go through the same validated, rollback-safe publish pipeline as the CSV path.

**No authentication** on `/admin/*` — anyone who can reach these routes can add/remove content; fine
for local dev and internal testing, revisit before exposing the deployed URL publicly.

See [Content format (CSV)](../README.md#content-format-csv) in the root README for the column list
and validation rules.

## Project layout

| Package | What's in it |
|---|---|
| `web` | REST controllers — one per route group (`ChatController`, `ModuleController`, `ProgressController`, `QuizController`, `AdminController`) |
| `engine` | `FsmEngine` (the conversation state machine), `ConversationCache` (in-memory content cache + validation), `ProgressSummaryService`, `UserService`/`UserProgressService` |
| `admin` | `CsvImporter`, `CsvExporter`, `PublishService` (the validated, transactional publish pipeline), `CrudService`, `TopicContentService`, `Slugify` |
| `entity` / `repository` | Spring Data JPA entities and repositories, one pair per Postgres table |
| `model` | The conversation-graph data shapes (`State`, `Option`, `ModuleEntry`, etc.) — mirror the JSON stored in `conversation_files` exactly |
| `dto` | Request/response shapes for the REST layer |
| `exception` | `AppException` (carries an HTTP status) + a `@RestControllerAdvice` handler, same JSON error shape as the Node version: `{"error": "..."}` |

## Data model

Everything lives in Postgres (`src/main/resources/schema.sql`):

- `conversation_files` — the FSM graph (states, transitions, quiz rules) and the topic registry, one
  row per former JSON file, `content` as `jsonb`. Source of truth for everything `ConversationCache`
  loads into its in-memory cache at boot.
- Per-user state: `users`, `user_progress` (current/last-completed state, module, status),
  `quiz_attempts` (answer log, used for retry counting), `sub_topic_completions`,
  `sub_topic_item_progress`.

Unchanged from the Node version — same tables, same columns, same JSONB content shape. This service
reads and writes the exact same schema, just through JPA instead of hand-written SQL.
