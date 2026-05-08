import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, QueryCommandResponse, QueryRowsResponse, QueryResponse } from './api.service';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { sql } from '@codemirror/lang-sql';
import { oneDark, oneDarkHighlightStyle } from '@codemirror/theme-one-dark';

type ModeId = 'sandbox' | `p${number}`;
type Problem = {
  id: ModeId;
  title: string;
  instructions: string;
  expectedSql: string;
};

type PersistedStateV1 = {
  v: 1;
  selectedModeId: ModeId;
  isDarkMode: boolean;
  queryLimit: number;
  completedProblemIds: ModeId[];
  draftsByMode: Record<string, string>;
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements AfterViewInit, OnDestroy {
  private readonly STORAGE_KEY = 'postgresql_practice_state_v1';
  selectedModeId: ModeId = 'sandbox';
  completedProblemIds = new Set<ModeId>();
  private readonly draftsByMode = new Map<ModeId, string>();
  isResetDialogOpen = false;

  problems: Problem[] = [
    {
      id: 'p1',
      title: 'Problem 1',
      instructions: 'Write a query that returns category names in alphabetical order.',
      expectedSql: `SELECT name FROM categories ORDER BY name;`
    },
    {
      id: 'p2',
      title: 'Problem 2',
      instructions: 'Write a query that returns each product name and its price in dollars (2 decimals), ordered by price descending.',
      expectedSql: `SELECT name, (price_cents / 100.0)::numeric(10,2) AS price\nFROM products\nORDER BY price DESC, name;`
    },
    {
      id: 'p3',
      title: 'Problem 3',
      instructions: 'Write a query that returns each user name with their total number of orders, ordered by total_orders desc then name.',
      expectedSql: `SELECT u.name, COUNT(o.id) AS total_orders\nFROM users u\nLEFT JOIN orders o ON o.user_id = u.id\nGROUP BY u.name\nORDER BY total_orders DESC, u.name;`
    },
    {
      id: 'p4',
      title: 'Problem 4',
      instructions: 'Write a query that returns order_id, user_name, and created_at for all orders, newest first.',
      expectedSql: `SELECT o.id AS order_id, u.name AS user_name, o.created_at\nFROM orders o\nJOIN users u ON u.id = o.user_id\nORDER BY o.created_at DESC, o.id DESC;`
    },
    {
      id: 'p5',
      title: 'Problem 5',
      instructions: 'Write a query that returns each order_id with the total quantity of items in that order, ordered by order_id.',
      expectedSql: `SELECT oi.order_id, SUM(oi.qty) AS total_qty\nFROM order_items oi\nGROUP BY oi.order_id\nORDER BY oi.order_id;`
    },
    {
      id: 'p6',
      title: 'Problem 6',
      instructions: 'Write a query that returns product_name and category_name for all product/category pairs, ordered by product then category.',
      expectedSql: `SELECT p.name AS product_name, c.name AS category_name\nFROM product_categories pc\nJOIN products p ON p.id = pc.product_id\nJOIN categories c ON c.id = pc.category_id\nORDER BY product_name, category_name;`
    },
    {
      id: 'p7',
      title: 'Problem 7',
      instructions: 'Write a query that returns category_name and number of products in that category, ordered by count desc then name.',
      expectedSql: `SELECT c.name AS category_name, COUNT(pc.product_id) AS product_count\nFROM categories c\nLEFT JOIN product_categories pc ON pc.category_id = c.id\nGROUP BY c.name\nORDER BY product_count DESC, category_name;`
    },
    {
      id: 'p8',
      title: 'Problem 8',
      instructions: 'Write a query that returns each order_id and its total value in dollars (sum of qty * price), ordered by total_value desc.',
      expectedSql: `SELECT oi.order_id,\n       ROUND(SUM(oi.qty * p.price_cents) / 100.0, 2) AS total_value\nFROM order_items oi\nJOIN products p ON p.id = oi.product_id\nGROUP BY oi.order_id\nORDER BY total_value DESC, oi.order_id;`
    },
    {
      id: 'p9',
      title: 'Problem 9',
      instructions: 'Write a query that returns users who have placed at least 1 order (name only), ordered by name.',
      expectedSql: `SELECT DISTINCT u.name\nFROM users u\nJOIN orders o ON o.user_id = u.id\nORDER BY u.name;`
    },
    {
      id: 'p10',
      title: 'Problem 10',
      instructions: 'Write a query that returns product_name and total_qty sold across all orders, ordered by total_qty desc then name.',
      expectedSql: `SELECT p.name AS product_name, SUM(oi.qty) AS total_qty\nFROM order_items oi\nJOIN products p ON p.id = oi.product_id\nGROUP BY p.name\nORDER BY total_qty DESC, product_name;`
    }
  ];

  tables: string[] = [];
  selectedTable: string | null = null;
  tablePreviewColumns: string[] = [];
  tablePreviewRows: unknown[][] = [];

  private readonly sandboxStarterSql =
    "SELECT o.id AS order_id, u.name, o.created_at\n" +
    "FROM orders o\n" +
    "JOIN users u ON u.id = o.user_id\n" +
    "ORDER BY o.created_at DESC;";

  sqlText = this.sandboxStarterSql;
  queryLimit = 500;

  isLoadingTables = false;
  isLoadingPreview = false;
  isRunningQuery = false;

  queryColumns: string[] = [];
  queryRows: unknown[][] = [];
  queryStatus: string | null = null;
  queryError: string | null = null;

  isDarkMode = true;

  @ViewChild('sqlEditorHost', { static: true }) private readonly sqlEditorHost?: ElementRef<HTMLDivElement>;
  private editorView?: EditorView;
  private readonly themeCompartment = new Compartment();

  constructor(private readonly api: ApiService) {
    this.hydrateFromStorage();
    this.applyThemeToDocument();
    if (!this.draftsByMode.has('sandbox')) {
      this.draftsByMode.set('sandbox', this.sandboxStarterSql);
    }
    this.refreshTables();
  }

  get activeProblem(): Problem | null {
    if (this.selectedModeId === 'sandbox') return null;
    return this.problems.find((p) => p.id === this.selectedModeId) ?? null;
  }

  selectMode(id: ModeId): void {
    // Save current draft before switching.
    this.draftsByMode.set(this.selectedModeId, this.sqlText);

    this.selectedModeId = id;
    this.queryError = null;
    this.queryStatus = null;

    const nextDraft =
      this.draftsByMode.get(id) ??
      (id === 'sandbox' ? this.sandboxStarterSql : '');
    this.setEditorText(nextDraft);
    this.persistState();
  }

  isProblemCompleted(id: ModeId): boolean {
    return this.completedProblemIds.has(id);
  }

  ngAfterViewInit(): void {
    const host = this.sqlEditorHost?.nativeElement;
    if (!host) return;

    const updateSqlTextFromEditor = EditorView.updateListener.of((v) => {
      if (!v.docChanged) return;
      this.sqlText = v.state.doc.toString();
      this.draftsByMode.set(this.selectedModeId, this.sqlText);
      this.persistState();
    });

    const state = EditorState.create({
      doc: this.draftsByMode.get(this.selectedModeId) ?? this.sqlText,
      extensions: [
        this.themeCompartment.of(
          this.isDarkMode
            ? [oneDark, syntaxHighlighting(oneDarkHighlightStyle)]
            : [syntaxHighlighting(defaultHighlightStyle)]
        ),
        history(),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        sql(),
        EditorView.lineWrapping,
        updateSqlTextFromEditor
      ]
    });

    this.editorView = new EditorView({ state, parent: host });
  }

  ngOnDestroy(): void {
    this.editorView?.destroy();
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
    this.applyThemeToDocument();
    this.editorView?.dispatch({
      effects: this.themeCompartment.reconfigure(
        this.isDarkMode
          ? [oneDark, syntaxHighlighting(oneDarkHighlightStyle)]
          : [syntaxHighlighting(defaultHighlightStyle)]
      )
    });
    this.persistState();
  }

  private applyThemeToDocument(): void {
    const theme = this.isDarkMode ? 'dark' : 'light';
    document.documentElement.dataset['theme'] = theme;
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
        if (res.kind === 'rows') {
          const r = res as QueryRowsResponse;
          this.queryColumns = r.columns;
          this.queryRows = r.rows;
          this.queryStatus = `Returned ${r.returned} row(s) (limit ${r.limit}).`;
        } else {
          const r = res as QueryCommandResponse;
          this.queryStatus = `${r.command} affected ${r.rowCount} row(s).`;
        }

        const problem = this.activeProblem;
        if (!problem) {
          this.isRunningQuery = false;
          return;
        }

        if (res.kind !== 'rows') {
          this.isRunningQuery = false;
          this.queryError = 'This problem requires a SELECT-style query that returns rows.';
          return;
        }

        // Auto-grade by comparing results to the expected SQL result.
        this.api.runQuery({ sql: problem.expectedSql, limit: this.queryLimit }).subscribe({
          next: (expected: QueryResponse) => {
            this.isRunningQuery = false;
            if (expected.kind !== 'rows') {
              this.queryError = 'Internal grading error: expected query did not return rows.';
              return;
            }

            const ok = this.resultsEqual(res as QueryRowsResponse, expected as QueryRowsResponse);
            if (ok) {
              this.completedProblemIds.add(problem.id);
              this.queryStatus = `Correct! ${problem.title} completed.`;
              this.persistState();
            } else {
              this.queryStatus = `Not quite. Try again — your result doesn't match the expected output.`;
            }
          },
          error: (e) => {
            this.isRunningQuery = false;
            this.queryError = `Grading failed: ${this.stringifyError(e)}`;
          }
        });
      },
      error: (e) => {
        this.isRunningQuery = false;
        this.queryError = this.stringifyError(e);
      }
    });
  }

  private setEditorText(text: string): void {
    this.sqlText = text;
    if (!this.editorView) return;
    const current = this.editorView.state.doc.toString();
    if (current === text) return;
    this.editorView.dispatch({
      changes: { from: 0, to: current.length, insert: text }
    });
  }

  resetAll(): void {
    // Use an in-app modal instead of window.confirm, since browser/extension settings can suppress dialogs.
    this.isResetDialogOpen = true;
  }

  cancelReset(): void {
    this.isResetDialogOpen = false;
  }

  confirmReset(): void {
    this.isResetDialogOpen = false;

    this.completedProblemIds.clear();
    this.draftsByMode.clear();
    this.draftsByMode.set('sandbox', this.sandboxStarterSql);
    this.selectedModeId = 'sandbox';
    this.queryLimit = 500;
    this.isDarkMode = true;
    this.applyThemeToDocument();

    this.editorView?.dispatch({
      effects: this.themeCompartment.reconfigure([oneDark, syntaxHighlighting(oneDarkHighlightStyle)])
    });
    this.setEditorText(this.sandboxStarterSql);

    this.queryColumns = [];
    this.queryRows = [];
    this.queryStatus = null;
    this.queryError = null;

    localStorage.removeItem(this.STORAGE_KEY);
  }

  private persistState(): void {
    const drafts: Record<string, string> = {};
    for (const [k, v] of this.draftsByMode.entries()) drafts[k] = v;
    const state: PersistedStateV1 = {
      v: 1,
      selectedModeId: this.selectedModeId,
      isDarkMode: this.isDarkMode,
      queryLimit: this.queryLimit,
      completedProblemIds: Array.from(this.completedProblemIds),
      draftsByMode: drafts
    };
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota / storage errors
    }
  }

  private hydrateFromStorage(): void {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedStateV1>;
      if (parsed.v !== 1) return;

      if (parsed.selectedModeId) this.selectedModeId = parsed.selectedModeId as ModeId;
      if (typeof parsed.isDarkMode === 'boolean') this.isDarkMode = parsed.isDarkMode;
      if (typeof parsed.queryLimit === 'number') this.queryLimit = parsed.queryLimit;

      if (Array.isArray(parsed.completedProblemIds)) {
        this.completedProblemIds = new Set(parsed.completedProblemIds as ModeId[]);
      }

      if (parsed.draftsByMode && typeof parsed.draftsByMode === 'object') {
        for (const [k, v] of Object.entries(parsed.draftsByMode)) {
          if (typeof v === 'string') this.draftsByMode.set(k as ModeId, v);
        }
      }

      // Set initial editor text (editor itself is created later in ngAfterViewInit).
      const initialDraft =
        this.draftsByMode.get(this.selectedModeId) ??
        (this.selectedModeId === 'sandbox' ? this.sandboxStarterSql : '');
      this.sqlText = initialDraft;
    } catch {
      // ignore malformed storage
    }
  }

  private resultsEqual(a: QueryRowsResponse, b: QueryRowsResponse): boolean {
    if (a.columns.length !== b.columns.length) return false;
    for (let i = 0; i < a.columns.length; i++) {
      if (String(a.columns[i]) !== String(b.columns[i])) return false;
    }
    if (a.rows.length !== b.rows.length) return false;
    for (let r = 0; r < a.rows.length; r++) {
      const rowA = a.rows[r] ?? [];
      const rowB = b.rows[r] ?? [];
      if (rowA.length !== rowB.length) return false;
      for (let c = 0; c < rowA.length; c++) {
        if (!this.cellEqual(rowA[c], rowB[c])) return false;
      }
    }
    return true;
  }

  private cellEqual(x: unknown, y: unknown): boolean {
    // Normalize common types coming back from JSON serialization.
    if (x === null || x === undefined) return y === null || y === undefined;
    if (y === null || y === undefined) return false;
    if (typeof x === 'number' && typeof y === 'number') return Object.is(x, y);
    return String(x) === String(y);
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
