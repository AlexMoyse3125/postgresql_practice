# AI_CONTEXT (AI-only)

This file is **for AI models**, not humans. It captures project intent, architecture, conventions, and persistent rules so a new model can be productive immediately.

## Project intent

Build a tiny, clone-and-run SQL practice environment:

- **PostgreSQL** runs in Docker.
- **FastAPI** (Python) exposes a minimal HTTP API:
  - Execute user-provided SQL and return results/errors.
  - Provide simple schema browsing endpoints for the UI.
- **Angular** provides a very basic UI:
  - SQL editor + Run button.
  - Table list sidebar; selecting a table shows first N rows.
  - Results table for SELECT/RETURNING; status text for non-row commands; error display.

The user explicitly prioritizes **low friction** over elegance. It can be clunky/over-engineered if it reduces setup pain.

## Non-negotiables / persistent rules

- **Everything should run via Docker Compose** (DB + API + UI).
- The Postgres database is **ephemeral** (no named volume).
  - A fresh startup produces a fresh seeded dataset.
- Seed dataset: **multiple small related tables** (join-friendly) to practice SQL.
- Keep the tool intentionally simple; avoid features that require credentials, logins, or external services.

## Expected runtime experience

- Primary command:
  - `docker compose up --build`
- URLs (default ports; keep stable unless necessary):
  - UI: `http://localhost:4200`
  - API: `http://localhost:8000` (OpenAPI at `/docs`)
- Reset:
  - `docker compose down` then `docker compose up --build` (ephemeral DB reseeds)

## Planned repo structure

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

## Dataset guidance

Prefer a small set of related tables that enable:
- basic selects
- joins (1:N and M:N)
- aggregation and grouping
- constraints (PK/FK/unique)

Example set:
- `users`, `products`, `orders`, `order_items`, `categories`, `product_categories`

## Development conventions (recommended)

- Prefer stable, explicit ports and service names (`db`, `api`, `ui`).
- Keep environment configuration in Compose (avoid local-only `.env` requirements).
- Avoid adding heavy tooling unless it improves the “clone + run” experience.

