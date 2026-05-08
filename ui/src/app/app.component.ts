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
  category: string;
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

type QueryOutputState = {
  columns: string[];
  rows: unknown[][];
  status: string | null;
  error: string | null;
};

type PersistedStateV2 = {
  v: 2;
  selectedModeId: ModeId;
  isDarkMode: boolean;
  queryLimit: number;
  completedProblemIds: ModeId[];
  draftsByMode: Record<string, string>;
  outputsByMode: Record<string, QueryOutputState>;
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements AfterViewInit, OnDestroy {
  private readonly STORAGE_KEY = 'postgresql_practice_state_v2';
  selectedModeId: ModeId = 'sandbox';
  completedProblemIds = new Set<ModeId>();
  private readonly draftsByMode = new Map<ModeId, string>();
  private readonly outputsByMode = new Map<ModeId, QueryOutputState>();
  isResetDialogOpen = false;
  isProblemResetDialogOpen = false;
  private problemResetTarget: ModeId | null = null;

  problemCategories: { name: string; problems: Problem[] }[] = [
    {
      name: 'Basics',
      problems: [
        {
          id: 'p1',
          title: 'Problem 1',
          category: 'Basics',
          instructions: 'Return category names in alphabetical order.',
          expectedSql: `SELECT name FROM categories ORDER BY name;`
        },
        {
          id: 'p2',
          title: 'Problem 2',
          category: 'Basics',
          instructions: 'Return product name and price_cents, ordered by price_cents descending then name.',
          expectedSql: `SELECT name, price_cents\nFROM products\nORDER BY price_cents DESC, name;`
        },
        {
          id: 'p3',
          title: 'Problem 3',
          category: 'Basics',
          instructions: 'Return user names (only), ordered by name.',
          expectedSql: `SELECT name\nFROM users\nORDER BY name;`
        }
      ]
    },
    {
      name: 'Filtering (WHERE)',
      problems: [
        {
          id: 'p4',
          title: 'Problem 4',
          category: 'Filtering (WHERE)',
          instructions: `Return products priced at least $30 (name + price_cents), ordered by price_cents desc then name.`,
          expectedSql: `SELECT name, price_cents\nFROM products\nWHERE price_cents >= 3000\nORDER BY price_cents DESC, name;`
        },
        {
          id: 'p5',
          title: 'Problem 5',
          category: 'Filtering (WHERE)',
          instructions: `Return orders from the last 5 days (order_id + created_at), newest first.`,
          expectedSql: `SELECT id AS order_id, created_at\nFROM orders\nWHERE created_at >= now() - interval '5 days'\nORDER BY created_at DESC, order_id DESC;`
        },
        {
          id: 'p6',
          title: 'Problem 6',
          category: 'Filtering (WHERE)',
          instructions: `Return categories whose name starts with 'B' or 'O' (name only), ordered by name.`,
          expectedSql: `SELECT name\nFROM categories\nWHERE name LIKE 'B%' OR name LIKE 'O%'\nORDER BY name;`
        }
      ]
    },
    {
      name: 'Aggregations',
      problems: [
        {
          id: 'p7',
          title: 'Problem 7',
          category: 'Aggregations',
          instructions: `Return each order_id and the total quantity of items in that order, ordered by order_id.`,
          expectedSql: `SELECT order_id, SUM(qty) AS total_qty\nFROM order_items\nGROUP BY order_id\nORDER BY order_id;`
        },
        {
          id: 'p8',
          title: 'Problem 8',
          category: 'Aggregations',
          instructions: `Return product_name and total_qty sold across all orders, ordered by total_qty desc then name.`,
          expectedSql: `SELECT p.name AS product_name, SUM(oi.qty) AS total_qty\nFROM order_items oi\nJOIN products p ON p.id = oi.product_id\nGROUP BY p.name\nORDER BY total_qty DESC, product_name;`
        },
        {
          id: 'p9',
          title: 'Problem 9',
          category: 'Aggregations',
          instructions: `Return categories and number of products in each category, ordered by product_count desc then name.`,
          expectedSql: `SELECT c.name AS category_name, COUNT(pc.product_id) AS product_count\nFROM categories c\nLEFT JOIN product_categories pc ON pc.category_id = c.id\nGROUP BY c.name\nORDER BY product_count DESC, category_name;`
        }
      ]
    },
    {
      name: 'Joins',
      problems: [
        {
          id: 'p10',
          title: 'Problem 10',
          category: 'Joins',
          instructions: `Return order_id, user_name, created_at for all orders, newest first.`,
          expectedSql: `SELECT o.id AS order_id, u.name AS user_name, o.created_at\nFROM orders o\nJOIN users u ON u.id = o.user_id\nORDER BY o.created_at DESC, o.id DESC;`
        },
        {
          id: 'p11',
          title: 'Problem 11',
          category: 'Joins',
          instructions: `Return product_name and category_name for all product/category pairs, ordered by product then category.`,
          expectedSql: `SELECT p.name AS product_name, c.name AS category_name\nFROM product_categories pc\nJOIN products p ON p.id = pc.product_id\nJOIN categories c ON c.id = pc.category_id\nORDER BY product_name, category_name;`
        },
        {
          id: 'p12',
          title: 'Problem 12',
          category: 'Joins',
          instructions: `Return orders that include a product in the 'Gadgets' category (distinct order_id), ordered by order_id.`,
          expectedSql: `SELECT DISTINCT oi.order_id\nFROM order_items oi\nJOIN product_categories pc ON pc.product_id = oi.product_id\nJOIN categories c ON c.id = pc.category_id\nWHERE c.name = 'Gadgets'\nORDER BY oi.order_id;`
        }
      ]
    },
    {
      name: 'CTEs & Subqueries',
      problems: [
        {
          id: 'p13',
          title: 'Problem 13',
          category: 'CTEs & Subqueries',
          instructions: `Return the product(s) with the highest total quantity sold (name + total_qty).`,
          expectedSql: `WITH totals AS (\n  SELECT p.name, SUM(oi.qty) AS total_qty\n  FROM order_items oi\n  JOIN products p ON p.id = oi.product_id\n  GROUP BY p.name\n)\nSELECT name, total_qty\nFROM totals\nWHERE total_qty = (SELECT MAX(total_qty) FROM totals)\nORDER BY name;`
        },
        {
          id: 'p14',
          title: 'Problem 14',
          category: 'CTEs & Subqueries',
          instructions: `Return each user and their most recent order timestamp (or NULL), ordered by recent_order desc then name.`,
          expectedSql: `SELECT u.name, MAX(o.created_at) AS recent_order\nFROM users u\nLEFT JOIN orders o ON o.user_id = u.id\nGROUP BY u.name\nORDER BY recent_order DESC NULLS LAST, u.name;`
        },
        {
          id: 'p15',
          title: 'Problem 15',
          category: 'CTEs & Subqueries',
          instructions: `Return users who have placed at least 1 order (name only), ordered by name.`,
          expectedSql: `SELECT DISTINCT u.name\nFROM users u\nJOIN orders o ON o.user_id = u.id\nORDER BY u.name;`
        }
      ]
    },
    {
      name: 'Set operations',
      problems: [
        {
          id: 'p16',
          title: 'Problem 16',
          category: 'Set operations',
          instructions: `Return names that are both a category name and a product name (single column 'name').`,
          expectedSql: `SELECT name FROM categories\nINTERSECT\nSELECT name FROM products\nORDER BY name;`
        },
        {
          id: 'p17',
          title: 'Problem 17',
          category: 'Set operations',
          instructions: `Return user emails that have NOT placed an order (email only), ordered by email.`,
          expectedSql: `SELECT email FROM users\nEXCEPT\nSELECT u.email\nFROM users u\nJOIN orders o ON o.user_id = u.id\nORDER BY email;`
        },
        {
          id: 'p18',
          title: 'Problem 18',
          category: 'Set operations',
          instructions: `Return a list of all category names and all user names in one column 'name' (duplicates allowed), ordered by name.`,
          expectedSql: `SELECT name FROM categories\nUNION ALL\nSELECT name FROM users\nORDER BY name;`
        }
      ]
    },
    {
      name: 'Date/time',
      problems: [
        {
          id: 'p19',
          title: 'Problem 19',
          category: 'Date/time',
          instructions: `Return each day (UTC date) and number of orders on that day, ordered by day descending.`,
          expectedSql: `SELECT (created_at AT TIME ZONE 'UTC')::date AS day_utc,\n       COUNT(*) AS orders\nFROM orders\nGROUP BY day_utc\nORDER BY day_utc DESC;`
        },
        {
          id: 'p20',
          title: 'Problem 20',
          category: 'Date/time',
          instructions: `Return orders created between 2 and 8 days ago inclusive (order_id + created_at), ordered by created_at.`,
          expectedSql: `SELECT id AS order_id, created_at\nFROM orders\nWHERE created_at >= now() - interval '8 days'\n  AND created_at <= now() - interval '2 days'\nORDER BY created_at, order_id;`
        },
        {
          id: 'p21',
          title: 'Problem 21',
          category: 'Date/time',
          instructions: `Return each user and how many orders they placed in the last 7 days, ordered by count desc then name.`,
          expectedSql: `SELECT u.name, COUNT(o.id) AS orders_last_7d\nFROM users u\nLEFT JOIN orders o\n  ON o.user_id = u.id\n AND o.created_at >= now() - interval '7 days'\nGROUP BY u.name\nORDER BY orders_last_7d DESC, u.name;`
        }
      ]
    },
    {
      name: 'Window functions',
      problems: [
        {
          id: 'p22',
          title: 'Problem 22',
          category: 'Window functions',
          instructions: `Return product_name, price_cents, and rank_by_price (1 = most expensive). Use RANK().`,
          expectedSql: `SELECT name AS product_name,\n       price_cents,\n       RANK() OVER (ORDER BY price_cents DESC) AS rank_by_price\nFROM products\nORDER BY rank_by_price, product_name;`
        },
        {
          id: 'p23',
          title: 'Problem 23',
          category: 'Window functions',
          instructions: `Return order_id, product_id, qty, and running_qty_per_order (running sum by product_id within each order).`,
          expectedSql: `SELECT order_id,\n       product_id,\n       qty,\n       SUM(qty) OVER (PARTITION BY order_id ORDER BY product_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_qty_per_order\nFROM order_items\nORDER BY order_id, product_id;`
        },
        {
          id: 'p24',
          title: 'Problem 24',
          category: 'Window functions',
          instructions: `Return each order with its total_value and that user’s order_number (1 = oldest order for that user).`,
          expectedSql: `WITH order_totals AS (\n  SELECT o.id AS order_id, o.user_id, o.created_at,\n         ROUND(SUM(oi.qty * p.price_cents) / 100.0, 2) AS total_value\n  FROM orders o\n  JOIN order_items oi ON oi.order_id = o.id\n  JOIN products p ON p.id = oi.product_id\n  GROUP BY o.id, o.user_id, o.created_at\n)\nSELECT u.name AS user_name,\n       ot.order_id,\n       ot.total_value,\n       ROW_NUMBER() OVER (PARTITION BY ot.user_id ORDER BY ot.created_at ASC, ot.order_id ASC) AS order_number\nFROM order_totals ot\nJOIN users u ON u.id = ot.user_id\nORDER BY user_name, order_number;`
        }
      ]
    },
    {
      name: 'NULL handling',
      problems: [
        {
          id: 'p25',
          title: 'Problem 25',
          category: 'NULL handling',
          instructions: `Return each user and total_spent (0 if none), ordered by total_spent desc then name.`,
          expectedSql: `SELECT u.name,\n       COALESCE(ROUND(SUM(oi.qty * p.price_cents) / 100.0, 2), 0) AS total_spent\nFROM users u\nLEFT JOIN orders o ON o.user_id = u.id\nLEFT JOIN order_items oi ON oi.order_id = o.id\nLEFT JOIN products p ON p.id = oi.product_id\nGROUP BY u.name\nORDER BY total_spent DESC, u.name;`
        },
        {
          id: 'p26',
          title: 'Problem 26',
          category: 'NULL handling',
          instructions: `Return each category and revenue (0 if none), ordered by revenue desc then name.`,
          expectedSql: `SELECT c.name AS category_name,\n       COALESCE(ROUND(SUM(oi.qty * p.price_cents) / 100.0, 2), 0) AS revenue\nFROM categories c\nLEFT JOIN product_categories pc ON pc.category_id = c.id\nLEFT JOIN products p ON p.id = pc.product_id\nLEFT JOIN order_items oi ON oi.product_id = p.id\nGROUP BY c.name\nORDER BY revenue DESC, category_name;`
        },
        {
          id: 'p27',
          title: 'Problem 27',
          category: 'NULL handling',
          instructions: `Return orders with a computed discount_pct column (always NULL) and use COALESCE to show 0 instead. Return order_id + discount_pct, ordered by order_id.`,
          expectedSql: `SELECT id AS order_id,\n       COALESCE(NULL::int, 0) AS discount_pct\nFROM orders\nORDER BY order_id;`
        }
      ]
    },
    {
      name: 'Top-N & ordering patterns',
      problems: [
        {
          id: 'p28',
          title: 'Problem 28',
          category: 'Top-N & ordering patterns',
          instructions: `Return the 3 most recent orders (order_id + created_at), newest first.`,
          expectedSql: `SELECT id AS order_id, created_at\nFROM orders\nORDER BY created_at DESC, order_id DESC\nLIMIT 3;`
        },
        {
          id: 'p29',
          title: 'Problem 29',
          category: 'Top-N & ordering patterns',
          instructions: `Return each category’s most expensive product (category_name, product_name, price_cents). Use DISTINCT ON.`,
          expectedSql: `SELECT DISTINCT ON (c.name)\n  c.name AS category_name,\n  p.name AS product_name,\n  p.price_cents\nFROM categories c\nJOIN product_categories pc ON pc.category_id = c.id\nJOIN products p ON p.id = pc.product_id\nORDER BY c.name, p.price_cents DESC, p.name;`
        },
        {
          id: 'p30',
          title: 'Problem 30',
          category: 'Top-N & ordering patterns',
          instructions: `Return the user(s) with the highest total_spent (name + total_spent).`,
          expectedSql: `WITH totals AS (\n  SELECT u.name,\n         COALESCE(ROUND(SUM(oi.qty * p.price_cents) / 100.0, 2), 0) AS total_spent\n  FROM users u\n  LEFT JOIN orders o ON o.user_id = u.id\n  LEFT JOIN order_items oi ON oi.order_id = o.id\n  LEFT JOIN products p ON p.id = oi.product_id\n  GROUP BY u.name\n)\nSELECT name, total_spent\nFROM totals\nWHERE total_spent = (SELECT MAX(total_spent) FROM totals)\nORDER BY name;`
        }
      ]
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

  get completedCount(): number {
    let count = 0;
    for (const p of this.problems) {
      if (this.completedProblemIds.has(p.id)) count++;
    }
    return count;
  }

  get totalProblems(): number {
    return this.problems.length;
  }

  get progressPercent(): number {
    const total = this.totalProblems;
    if (total <= 0) return 0;
    return Math.round((this.completedCount / total) * 100);
  }

  get activeProblem(): Problem | null {
    if (this.selectedModeId === 'sandbox') return null;
    return this.problems.find((p) => p.id === this.selectedModeId) ?? null;
  }

  get problems(): Problem[] {
    return this.problemCategories.flatMap((c) => c.problems);
  }

  selectMode(id: ModeId): void {
    // Save current draft before switching.
    this.draftsByMode.set(this.selectedModeId, this.sqlText);
    this.saveCurrentOutputState();

    this.selectedModeId = id;

    const nextDraft =
      this.draftsByMode.get(id) ??
      (id === 'sandbox' ? this.sandboxStarterSql : '');
    this.setEditorText(nextDraft);
    this.loadOutputStateForMode(id);
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
    this.saveCurrentOutputState();

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

        this.saveCurrentOutputState();

        const problem = this.activeProblem;
        if (!problem) {
          this.isRunningQuery = false;
          this.persistState();
          return;
        }

        if (res.kind !== 'rows') {
          this.isRunningQuery = false;
          this.queryError = 'This problem requires a SELECT-style query that returns rows.';
          this.saveCurrentOutputState();
          this.persistState();
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
              this.persistState();
            }
            this.saveCurrentOutputState();
          },
          error: (e) => {
            this.isRunningQuery = false;
            this.queryError = `Grading failed: ${this.stringifyError(e)}`;
            this.saveCurrentOutputState();
          }
        });
      },
      error: (e) => {
        this.isRunningQuery = false;
        this.queryError = this.stringifyError(e);
        this.saveCurrentOutputState();
        this.persistState();
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
    this.outputsByMode.clear();

    localStorage.removeItem(this.STORAGE_KEY);
  }

  openProblemReset(): void {
    this.problemResetTarget = this.selectedModeId;
    this.isProblemResetDialogOpen = true;
  }

  cancelProblemReset(): void {
    this.problemResetTarget = null;
    this.isProblemResetDialogOpen = false;
  }

  confirmProblemReset(): void {
    const target = this.problemResetTarget;
    this.problemResetTarget = null;
    this.isProblemResetDialogOpen = false;
    if (!target) return;

    // Clear per-problem state.
    this.completedProblemIds.delete(target);
    const draft = target === 'sandbox' ? this.sandboxStarterSql : '';
    this.draftsByMode.set(target, draft);
    this.outputsByMode.delete(target);

    if (this.selectedModeId === target) {
      this.setEditorText(draft);
      this.queryColumns = [];
      this.queryRows = [];
      this.queryStatus = null;
      this.queryError = null;
    }

    this.persistState();
  }

  private defaultOutputState(): QueryOutputState {
    return { columns: [], rows: [], status: null, error: null };
  }

  private saveCurrentOutputState(): void {
    this.outputsByMode.set(this.selectedModeId, {
      columns: [...this.queryColumns],
      rows: [...this.queryRows],
      status: this.queryStatus,
      error: this.queryError
    });
  }

  private loadOutputStateForMode(id: ModeId): void {
    const s = this.outputsByMode.get(id) ?? this.defaultOutputState();
    this.queryColumns = s.columns ?? [];
    this.queryRows = s.rows ?? [];
    this.queryStatus = s.status ?? null;
    this.queryError = s.error ?? null;
  }

  private persistState(): void {
    const drafts: Record<string, string> = {};
    for (const [k, v] of this.draftsByMode.entries()) drafts[k] = v;
    const outputs: Record<string, QueryOutputState> = {};
    for (const [k, v] of this.outputsByMode.entries()) outputs[k] = v;

    const state: PersistedStateV2 = {
      v: 2,
      selectedModeId: this.selectedModeId,
      isDarkMode: this.isDarkMode,
      queryLimit: this.queryLimit,
      completedProblemIds: Array.from(this.completedProblemIds),
      draftsByMode: drafts,
      outputsByMode: outputs
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
      const parsed = JSON.parse(raw) as Partial<PersistedStateV2>;
      if (parsed.v !== 2) return;

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

      if (parsed.outputsByMode && typeof parsed.outputsByMode === 'object') {
        for (const [k, v] of Object.entries(parsed.outputsByMode)) {
          const maybe = v as Partial<QueryOutputState> | undefined;
          if (!maybe) continue;
          this.outputsByMode.set(k as ModeId, {
            columns: Array.isArray(maybe.columns) ? (maybe.columns as string[]) : [],
            rows: Array.isArray(maybe.rows) ? (maybe.rows as unknown[][]) : [],
            status: typeof maybe.status === 'string' ? maybe.status : null,
            error: typeof maybe.error === 'string' ? maybe.error : null
          });
        }
      }

      // Set initial editor text (editor itself is created later in ngAfterViewInit).
      const initialDraft =
        this.draftsByMode.get(this.selectedModeId) ??
        (this.selectedModeId === 'sandbox' ? this.sandboxStarterSql : '');
      this.sqlText = initialDraft;

      // Set initial output state.
      this.loadOutputStateForMode(this.selectedModeId);
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
