import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, QueryCommandResponse, QueryRowsResponse, QueryResponse } from './api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  tables: string[] = [];
  selectedTable: string | null = null;
  tablePreviewColumns: string[] = [];
  tablePreviewRows: unknown[][] = [];

  sqlText =
    "SELECT o.id AS order_id, u.name, o.created_at\n" +
    "FROM orders o\n" +
    "JOIN users u ON u.id = o.user_id\n" +
    "ORDER BY o.created_at DESC;";
  queryLimit = 500;

  isLoadingTables = false;
  isLoadingPreview = false;
  isRunningQuery = false;

  queryColumns: string[] = [];
  queryRows: unknown[][] = [];
  queryStatus: string | null = null;
  queryError: string | null = null;

  constructor(private readonly api: ApiService) {
    this.refreshTables();
  }

  refreshTables() {
    this.isLoadingTables = true;
    this.api.listTables().subscribe({
      next: (tables) => {
        this.tables = tables;
        this.isLoadingTables = false;
        if (!this.selectedTable && tables.length) {
          this.selectTable(tables[0]);
        }
      },
      error: (e) => {
        this.isLoadingTables = false;
        this.queryError = this.stringifyError(e);
      }
    });
  }

  selectTable(table: string) {
    this.selectedTable = table;
    this.isLoadingPreview = true;
    this.api.previewTable(table, 100, 0).subscribe({
      next: (res) => {
        this.tablePreviewColumns = res.columns;
        this.tablePreviewRows = res.rows;
        this.isLoadingPreview = false;
      },
      error: (e) => {
        this.isLoadingPreview = false;
        this.queryError = this.stringifyError(e);
      }
    });
  }

  runQuery() {
    this.queryError = null;
    this.queryStatus = null;
    this.queryColumns = [];
    this.queryRows = [];

    this.isRunningQuery = true;
    const sqlText = this.sqlText?.trim();
    if (!sqlText) {
      this.isRunningQuery = false;
      this.queryError = 'SQL is empty.';
      return;
    }

    this.api.runQuery({ sql: sqlText, limit: this.queryLimit }).subscribe({
      next: (res: QueryResponse) => {
        this.isRunningQuery = false;
        if (res.kind === 'rows') {
          const r = res as QueryRowsResponse;
          this.queryColumns = r.columns;
          this.queryRows = r.rows;
          this.queryStatus = `Returned ${r.returned} row(s) (limit ${r.limit}).`;
        } else {
          const r = res as QueryCommandResponse;
          this.queryStatus = `${r.command} affected ${r.rowCount} row(s).`;
        }
      },
      error: (e) => {
        this.isRunningQuery = false;
        this.queryError = this.stringifyError(e);
      }
    });
  }

  private stringifyError(e: any): string {
    if (!e) return 'Unknown error.';
    if (typeof e === 'string') return e;
    if (typeof e?.message === 'string') return e.message;
    if (typeof e?.detail === 'string') return e.detail;
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
}
