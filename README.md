# postgresql_practice

The goal of this repo is to provide a **zero-friction SQL practice environment**:

- A real **PostgreSQL** database (Docker)
- A tiny **Python (FastAPI)** API that executes SQL and returns results
- A very basic **Angular** UI to run queries and browse tables

## Quick start

Prerequisite: **Docker Desktop** (or Docker Engine + Compose).

From the repo directory:

```bash
docker compose up --build
```

Then open:

- UI: `http://localhost:4200`
- API (for debugging): `http://localhost:8000/docs`

## Resetting the database

The database is **ephemeral** (no volume). To reset to a fresh seeded state:

```bash
docker compose down
docker compose up --build
```

## Example practice queries

```sql
-- List tables
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Preview users
SELECT * FROM users ORDER BY id;

-- Join orders to users
SELECT o.id AS order_id, u.name, o.created_at
FROM orders o
JOIN users u ON u.id = o.user_id
ORDER BY o.created_at DESC;

-- Aggregation: total quantity per product
SELECT p.name, SUM(oi.qty) AS total_qty
FROM order_items oi
JOIN products p ON p.id = oi.product_id
GROUP BY p.name
ORDER BY total_qty DESC;
```

## Notes

- The UI is intentionally simple; correctness and low friction matter more than polish.
- This is a practice tool: the API accepts arbitrary SQL. Don’t point it at a production database.

