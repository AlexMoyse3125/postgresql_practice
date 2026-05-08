import os
from typing import Any, Literal

import psycopg
from psycopg import sql
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


def _get_database_url() -> str:
    raw = os.environ.get("DATABASE_URL", "postgresql://practice:practice@db:5432/practice")
    # Allow docker-compose style SQLAlchemy-ish scheme.
    return raw.replace("postgresql+psycopg://", "postgresql://")


def _default_limit() -> int:
    try:
        return int(os.environ.get("QUERY_DEFAULT_LIMIT", "500"))
    except ValueError:
        return 500


app = FastAPI(title="postgresql_practice API")

allow_origins = [o.strip() for o in os.environ.get("CORS_ALLOW_ORIGINS", "").split(",") if o.strip()]
if allow_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )


class QueryRequest(BaseModel):
    sql: str = Field(min_length=1)
    limit: int | None = Field(default=None, ge=1, le=5000)


class QueryRowsResponse(BaseModel):
    kind: Literal["rows"] = "rows"
    columns: list[str]
    rows: list[list[Any]]
    returned: int
    limit: int


class QueryCommandResponse(BaseModel):
    kind: Literal["command"] = "command"
    command: str
    rowCount: int


class ErrorResponse(BaseModel):
    kind: Literal["error"] = "error"
    message: str
    code: str | None = None
    detail: str | None = None


def _is_identifier_safe(name: str) -> bool:
    # Minimal safety: don't allow empty / weird quoting. Real protection is using Identifier() for SQL.
    return bool(name) and len(name) <= 63


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/query", response_model=QueryRowsResponse | QueryCommandResponse)
def run_query(body: QueryRequest):
    limit = body.limit or _default_limit()

    try:
        with psycopg.connect(_get_database_url()) as conn:
            with conn.cursor() as cur:
                cur.execute(body.sql)

                if cur.description is None:
                    cmd = (cur.statusmessage or "").split(" ")[0] or "COMMAND"
                    return QueryCommandResponse(command=cmd, rowCount=max(cur.rowcount, 0))

                columns = [c.name for c in cur.description]
                rows = cur.fetchmany(limit)
                return QueryRowsResponse(columns=columns, rows=[list(r) for r in rows], returned=len(rows), limit=limit)

    except psycopg.Error as e:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                message=str(e).strip(),
                code=getattr(e, "sqlstate", None),
                detail=getattr(e, "diag", None).message_detail if getattr(e, "diag", None) else None,
            ).model_dump(),
        ) from e


@app.get("/schema/tables")
def list_tables() -> list[str]:
    q = """
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename;
    """
    with psycopg.connect(_get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(q)
            return [r[0] for r in cur.fetchall()]


@app.get("/schema/tables/{table}/columns")
def list_columns(table: str) -> list[dict[str, Any]]:
    if not _is_identifier_safe(table):
        raise HTTPException(status_code=400, detail={"kind": "error", "message": "Invalid table name."})

    q = """
    SELECT
      column_name,
      data_type,
      is_nullable,
      ordinal_position
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = %s
    ORDER BY ordinal_position;
    """
    with psycopg.connect(_get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(q, (table,))
            return [
                {
                    "name": r[0],
                    "data_type": r[1],
                    "nullable": r[2] == "YES",
                    "position": r[3],
                }
                for r in cur.fetchall()
            ]


@app.get("/tables/{table}/rows")
def table_rows(table: str, limit: int = 100, offset: int = 0) -> dict[str, Any]:
    if not _is_identifier_safe(table):
        raise HTTPException(status_code=400, detail={"kind": "error", "message": "Invalid table name."})
    if limit < 1 or limit > 1000:
        raise HTTPException(status_code=400, detail={"kind": "error", "message": "Invalid limit."})
    if offset < 0 or offset > 1_000_000:
        raise HTTPException(status_code=400, detail={"kind": "error", "message": "Invalid offset."})

    with psycopg.connect(_get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql.SQL("SELECT * FROM {} LIMIT %s OFFSET %s").format(sql.Identifier(table)), (limit, offset))
            cols = [c.name for c in cur.description] if cur.description else []
            rows = cur.fetchall()
            return {"columns": cols, "rows": [list(r) for r in rows], "limit": limit, "offset": offset}

