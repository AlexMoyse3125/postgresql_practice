# AI_CONTEXT (AI-only)

This file is **for AI models**, not humans. It captures project intent, architecture, conventions, and persistent rules so a new model can be productive immediately.

## Project intent

Build a tiny, clone-and-run SQL practice environment:

- **PostgreSQL** runs in Docker.
- **FastAPI** (Python) exposes a minimal HTTP API:
  - Execute user-provided SQL and return results/errors.
  - Provide simple schema browsing endpoints for the UI.
- **Angular** provides a minimal “practice/game” UI:
  - CodeMirror-based SQL editor with SQL highlighting.
  - Sandbox + categorized problems (auto-graded).
  - Query results viewer + table preview viewer.
  - Theme toggle (day/night), reset flows.

The user explicitly prioritizes **low friction** over elegance. It can be clunky/over-engineered if it reduces setup pain.

## Non-negotiables / persistent rules

- **Everything should run via Docker Compose** (DB + API + UI).
- The Postgres database is **ephemeral** (no named volume).
  - A fresh startup produces a fresh seeded dataset.
- Seed dataset: **multiple small related tables** (join-friendly) to practice SQL.
- Keep the tool intentionally simple; avoid features that require credentials, logins, or external services.
- The user may ask for longer, open-ended UI iterations; **do not commit/push unless explicitly requested**.

## Expected runtime experience

- Primary command:
  - `docker compose up --build`
- URLs (default ports; keep stable unless necessary):
  - UI: `http://localhost:4200`
  - API: `http://localhost:8000` (OpenAPI at `/docs`)
- Reset:
  - `docker compose down` then `docker compose up --build` (ephemeral DB reseeds)

## Repo structure (current)

- `docker-compose.yml`
- `README.md`
- `AI_CONTEXT.md` (this file)
- `db/init/00_schema.sql` and `db/init/01_seed.sql`
  - Mounted into `/docker-entrypoint-initdb.d/` for auto-init on DB container creation.
- `api/` (FastAPI app + Dockerfile)
- `ui/` (Angular app + Dockerfile)

## API shape (MVP)

- `POST /query`
  - Body: `{ "sql": "....", "limit": 500 }`
  - Returns either:
    - `{ columns: string[], rows: any[][] }` (row-producing statements)
    - `{ command: string, rowCount: number }` (non-row statements)
  - On error: structured error payload.
- `GET /schema/tables`
- `GET /schema/tables/{table}/columns`
- `GET /tables/{table}/rows?limit=100&offset=0`

Guardrails:
- Allow arbitrary SQL (practice tool), but apply a **soft row limit** to keep UI responsive.
- Use parameterized queries for table browsing endpoints.

## Dataset (current)

Prefer a small set of related tables that enable:
- basic selects
- joins (1:N and M:N)
- aggregation and grouping
- constraints (PK/FK/unique)

Current tables:
- `users`, `products`, `categories`
- `orders`, `order_items`
- `product_categories` (many-to-many)

Seed size (approx; may change as seed expands):
- `users`: ~10
- `products`: ~16
- `orders`: ~15
- `order_items`: ~29

## UI/game mechanics (current)

### Modes
- `Sandbox`: starts with a prefilled sample query.
- `Problems`: categorized list of problems; each problem has instructions and an expected result.

### Problem definitions
- Problems live in `ui/src/app/app.component.ts` as `problemCategories`.
- Each problem has:
  - `id` (e.g. `p1`..`p30`)
  - `category` and `title`
  - `instructions` (displayed above editor)
  - `expectedSql` (used for grading)

### Grading model
- When on a problem, clicking **Run**:
  - executes user SQL
  - executes `expectedSql`
  - compares **columns + rows** for equality (stringified cell compare for most types)
- Non-row statements are rejected for problems (expects SELECT-like row output).

### Persistence model
- Browser persistence via `localStorage` (see `STORAGE_KEY` in `app.component.ts`).
- Persisted items include:
  - selected mode
  - theme (day/night)
  - query limit
  - completion status
  - drafts per mode (autosave)
  - query output per mode (columns/rows/status/error)

### Reset flows
- Global reset: left sidebar **Reset** button with an in-app modal confirmation.
- Per-problem reset: header **Reset problem** button; clears draft/output/completion for current mode.

### UX constraints (important)
- Page/panels are intended to be **fixed size**; content should scroll within panels, not resize the layout.

## Development conventions (recommended)

- Prefer stable, explicit ports and service names (`db`, `api`, `ui`).
- Keep environment configuration in Compose (avoid local-only `.env` requirements).
- Avoid adding heavy tooling unless it improves the “clone + run” experience.

