import { beforeEach, describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { applySchema, createTestDb } from './sqlite-shim';
import { mergeDuplicates } from '../../src/worker/dedupe';

const db = createTestDb();
const d1 = db as unknown as D1Database;

async function insert(row: {
  id: string;
  title: string;
  start: string;
  end: string;
  url: string | null;
  judged?: boolean;
}): Promise<void> {
  await db
    .prepare(
      `INSERT INTO events (id, title, start_date, end_date, start_time, timezone, mode, region, venue, city,
        cost_kind, cost_amount, cost_currency, deadline, url, source_url, source_name, topics, ai_status, ai_detail,
        judgement, first_seen, last_seen, updated_at)
       VALUES (?, ?, ?, ?, NULL, 'Asia/Tokyo', 'online', 'online', NULL, NULL, 'free', 0, NULL, NULL, ?, 'https://agg.example/x',
        'test', '["game-jam"]', NULL, NULL, ?, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`,
    )
    .bind(row.id, row.title, row.start, row.end, row.url, row.judged ? JSON.stringify({ relevance: 0.5, fit: 'medium', why: 'x' }) : null)
    .run();
}

beforeEach(() => {
  db.exec('DROP TABLE IF EXISTS events; DROP TABLE IF EXISTS ingest_runs;');
  applySchema(db);
});

describe('mergeDuplicates', () => {
  it('folds an aggregator row into the row that has the event page', async () => {
    await insert({ id: 'evt_seed', title: 'GitHub Game Off 2026', start: '2026-11-01', end: '2026-12-01', url: 'https://itch.io/jams', judged: true });
    await insert({ id: 'evt_live', title: 'Game Off 2026', start: '2026-11-01', end: '2026-12-01', url: 'https://itch.io/jam/game-off-2026' });

    const { merged } = await mergeDuplicates(d1);
    expect(merged).toBe(1);

    const rows = (await db.prepare('SELECT id, url, judgement FROM events').all<{ id: string; url: string; judgement: string | null }>()).results;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.url).toBe('https://itch.io/jam/game-off-2026');
    expect(rows[0]?.judgement).toBeTruthy(); // the judgement survived the merge
  });

  it('keeps a single-day placeholder and a real window in one row', async () => {
    await insert({ id: 'evt_single', title: 'Godot Wild Jam #99', start: '2026-11-22', end: '2026-11-22', url: 'https://itch.io/jams' });
    await insert({ id: 'evt_window', title: 'Godot Wild Jam #99', start: '2026-11-13', end: '2026-11-22', url: 'https://itch.io/jam/godot-wild-jam-99' });

    await mergeDuplicates(d1);
    const rows = (await db.prepare('SELECT id, start_date, end_date, url FROM events').all<{ id: string; start_date: string; end_date: string; url: string }>()).results;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.url).toContain('/jam/godot-wild-jam-99');
  });

  it('does not merge different events on different dates', async () => {
    await insert({ id: 'evt_a', title: 'Tokyo Indies', start: '2026-11-18', end: '2026-11-18', url: 'https://a.example/1' });
    await insert({ id: 'evt_b', title: 'Tokyo Indies', start: '2026-12-16', end: '2026-12-16', url: 'https://a.example/2' });

    const { merged } = await mergeDuplicates(d1);
    expect(merged).toBe(0);
    const count = (await db.prepare('SELECT COUNT(*) AS n FROM events').first<{ n: number }>())?.n;
    expect(count).toBe(2);
  });
});
