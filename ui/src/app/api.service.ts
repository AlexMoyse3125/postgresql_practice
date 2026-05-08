import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

export type QueryRequest = { sql: string; limit?: number };
export type QueryRowsResponse = {
  kind: 'rows';
  columns: string[];
  rows: unknown[][];
  returned: number;
  limit: number;
};
export type QueryCommandResponse = { kind: 'command'; command: string; rowCount: number };
export type QueryResponse = QueryRowsResponse | QueryCommandResponse;

export type TablePreviewResponse = {
  columns: string[];
  rows: unknown[][];
  limit: number;
  offset: number;
};

@Injectable({ providedIn: 'root' })
export class ApiService {
  // Simple + stable default for Docker Compose usage from the host browser.
  private readonly baseUrl = (globalThis as any).__API_BASE_URL__ ?? 'http://localhost:8000';

  constructor(private readonly http: HttpClient) {}

  listTables() {
    return this.http.get<string[]>(`${this.baseUrl}/schema/tables`).pipe(catchError(this.handleError));
  }

  previewTable(table: string, limit = 100, offset = 0) {
    const params = new HttpParams().set('limit', String(limit)).set('offset', String(offset));
    return this.http
      .get<TablePreviewResponse>(`${this.baseUrl}/tables/${encodeURIComponent(table)}/rows`, { params })
      .pipe(catchError(this.handleError));
  }

  runQuery(req: QueryRequest) {
    return this.http.post<QueryResponse>(`${this.baseUrl}/query`, req).pipe(catchError(this.handleError));
  }

  private handleError(err: HttpErrorResponse) {
    const detail = err.error?.message ? err.error : err.error?.detail ?? err.error ?? err.message;
    return throwError(() => detail);
  }
}

