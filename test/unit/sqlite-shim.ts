// Minimal D1-compatible facade over node:sqlite so store.ts can be unit-tested
// against real SQLite semantics without booting workerd.
import { DatabaseSync } from 'node:sqlite';

interface RunResult {
  meta: { last_row_id: number; changes: number };
}

class PreparedStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): PreparedStatement {
    return new PreparedStatement(this.db, this.sql, params);
  }

  async all<T>(): Promise<{ results: T[] }> {
    const statement = this.db.prepare(this.sql);
    const rows = statement.all(...(this.params as never[])) as T[];
    return { results: rows };
  }

  async first<T>(): Promise<T | null> {
    const statement = this.db.prepare(this.sql);
    const row = statement.get(...(this.params as never[])) as T | undefined;
    return row ?? null;
  }

  async run(): Promise<RunResult> {
    const statement = this.db.prepare(this.sql);
    const info = statement.run(...(this.params as never[]));
    return { meta: { last_row_id: Number(info.lastInsertRowid ?? 0), changes: Number(info.changes ?? 0) } };
  }
}

/** Implements the subset of D1Database that src/worker/store.ts uses. */
export function createTestDb(): { prepare: (sql: string) => PreparedStatement; batch: (statements: PreparedStatement[]) => Promise<unknown[]>; exec: (sql: string) => void; close: () => void } {
  const db = new DatabaseSync(':memory:');
  return {
    prepare: (sql: string) => new PreparedStatement(db, sql),
    batch: async (statements: PreparedStatement[]) => Promise.all(statements.map((statement) => statement.run())),
    exec: (sql: string) => db.exec(sql),
    close: () => db.close(),
  };
}

export function applySchema(database: ReturnType<typeof createTestDb>): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
      start_time TEXT, timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo', mode TEXT NOT NULL DEFAULT 'unknown',
      region TEXT NOT NULL DEFAULT 'unknown', venue TEXT, city TEXT, cost_kind TEXT, cost_amount INTEGER,
      cost_currency TEXT, deadline TEXT, url TEXT, source_url TEXT NOT NULL, source_name TEXT,
      topics TEXT NOT NULL DEFAULT '[]', ai_status TEXT, ai_detail TEXT, judgement TEXT,
      first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ingest_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, started_at TEXT NOT NULL,
      finished_at TEXT, status TEXT NOT NULL, items INTEGER NOT NULL DEFAULT 0, error TEXT
    );
  `);
}
