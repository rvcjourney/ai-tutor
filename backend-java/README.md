# AI Tutor — Backend (Java / Spring Boot)

Config-driven FSM conversation engine + REST API. No LLM/RAG/AI — every response comes from
conversation graphs (states, transitions, quiz rules) stored as JSON blobs in Postgres. This is a
behavioral port of the original Node/Express backend (`../backend/`) — same routes, same JSON
shapes, same CSV format, same Postgres schema — built for a team that maintains Java/Spring Boot.

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

Identical contract to the original Node backend — see the root `README.md`'s "Content format (CSV)"
section and `../backend/README.md` for the full endpoint list, request/response shapes, and the
CSV column format. Nothing here differs by language; this file only covers what's Java-specific
(build, run, project layout).

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

Unchanged from the Node version — same tables, same columns, same JSONB content shape. See the root
`README.md`'s "Content format" section or `../backend/README.md`'s "Data model" section; this
service reads and writes the exact same schema, just through JPA instead of hand-written SQL.
