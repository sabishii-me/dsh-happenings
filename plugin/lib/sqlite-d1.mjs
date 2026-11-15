import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new Statement(this.db, this.sql, params);
  }

  async all() {
    return { results: this.db.prepare(this.sql).all(...this.params) };
  }

  async first() {
    return this.db.prepare(this.sql).get(...this.params) ?? null;
  }

  async run() {
    const info = this.db.prepare(this.sql).run(...this.params);
    return {
      meta: {
        last_row_id: Number(info.lastInsertRowid ?? 0),
        changes: Number(info.changes ?? 0),
      },
    };
  }
}

class Database {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL;');
  }

  prepare(sql) {
    return new Statement(this.db, sql);
  }

  async batch(statements) {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  exec(sql) {
    this.db.exec(sql);
  }

  close() {
    this.db.close();
  }
}

/**
 * Open (or create) the plugin database. The schema and seed are the same SQL
 * files the site uses, copied into plugin/data by the plugin build.
 */
export function openDatabase(file, schemaSql, seedSql) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.exec(schemaSql);
  const row = db.db.prepare('SELECT COUNT(*) AS n FROM events').get();
  if (!row || row.n === 0) db.exec(seedSql);
  return db;
}
