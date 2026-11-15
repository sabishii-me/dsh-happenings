import { beforeEach, describe, expect, it } from 'vitest';
import { applySchema, createTestDb } from './sqlite-shim';
import type { D1Database } from '@cloudflare/workers-types';
import { eventHref, getById, meta, queryRange, saveJudgement, toApiEvent, upsertMany } from '../../src/worker/store';
import type { EventRecord } from '../../src/domain/types';

const db = createTestDb();
const d1 = db as unknown as D1Database;

function record(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: 'evt_1',
    title: 'Test Event',
    startDate: '2026-12-04',
    endDate: '2026-12-06',
    startTime: null,
    timezone: 'Asia/Tokyo',
    mode: 'offline',
    region: 'jp',
    venue: 'Tokyo',
    city: 'Tokyo',
    costKind: 'free',
    costAmount: 0,
    costCurrency: null,
    deadline: null,
    url: 'https://example.com/e',
    sourceUrl: 'https://example.com/e',
    sourceName: 'test',
    topics: ['game-jam'],
    aiStatus: null,
    aiDetail: null,
    judgement: null,
    firstSeen: '2026-11-13T00:00:00.000Z',
    lastSeen: '2026-11-13T00:00:00.000Z',
    updatedAt: '2026-11-13T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  db.exec('DROP TABLE IF EXISTS events; DROP TABLE IF EXISTS ingest_runs;');
  applySchema(db);
});

describe('store', () => {
  it('is idempotent on the same id', async () => {
    await upsertMany(d1, [record()]);
    await upsertMany(d1, [record({ title: 'Test Event (updated)' })]);
    const rows = await queryRange(d1, { from: '2026-11-01', to: '2026-12-31', topics: [], ai: null });
    expect(rows.total).toBe(1);
    expect(rows.items[0]?.title).toBe('Test Event (updated)');
  });

  it('keeps a previously stored judgement when the collector re-upserts', async () => {
    await upsertMany(d1, [record()]);
    await saveJudgement(d1, 'evt_1', { relevance: 0.8, fit: 'high', why: 'good' }, 'allowed', 'AI ok');
    await upsertMany(d1, [record({ title: 'Test Event v2' })]);
    const stored = await getById(d1, 'evt_1');
    expect(stored?.judgement?.why).toBe('good');
    expect(stored?.aiStatus).toBe('allowed');
  });

  it('returns events overlapping the range, including multi-day spans', async () => {
    await upsertMany(d1, [
      record({ id: 'evt_span', startDate: '2026-11-10', endDate: '2026-12-20' }),
      record({ id: 'evt_after', startDate: '2027-03-01', endDate: '2027-03-02' }),
    ]);
    const november = await queryRange(d1, { from: '2026-11-15', to: '2026-11-16', topics: [], ai: null });
    expect(november.items.map((item) => item.id)).toEqual(['evt_span']);
  });

  it('filters by topic and by AI status', async () => {
    await upsertMany(d1, [
      record({ id: 'evt_a', topics: ['meetup'] }),
      record({ id: 'evt_b', topics: ['game-jam'] }),
    ]);
    await saveJudgement(d1, 'evt_a', { relevance: 0.5, fit: 'medium', why: 'x' }, 'restricted', 'limit');

    const jam = await queryRange(d1, { from: '2026-11-01', to: '2026-12-31', topics: ['game-jam'], ai: null });
    expect(jam.items.map((item) => item.id)).toEqual(['evt_b']);

    const restricted = await queryRange(d1, { from: '2026-11-01', to: '2026-12-31', topics: [], ai: ['restricted'] });
    expect(restricted.items.map((item) => item.id)).toEqual(['evt_a']);
  });

  it('reports counts and the last run per source', async () => {
    await upsertMany(d1, [record()]);
    await db.prepare("INSERT INTO ingest_runs (source, started_at, finished_at, status, items) VALUES ('connpass', '2026-11-13T00:00:00Z', '2026-11-13T00:00:01Z', 'ok', 12)").run();
    const info = await meta(d1);
    expect(info.total).toBe(1);
    expect(info.sources[0]).toMatchObject({ source: 'connpass', status: 'ok', items: 12 });
  });
});

describe('link resolution', () => {
  it('falls back to the source listing, and says so', () => {
    const sourceOnly = record({ id: 'evt_s', url: null, sourceUrl: 'https://aggregator.example/list' });
    const api = toApiEvent(sourceOnly);
    expect(eventHref(sourceOnly)).toBe('https://aggregator.example/list');
    expect(api.hrefIsSource).toBe(true);
  });

  it('prefers the event page and marks it as not-a-source', () => {
    const api = toApiEvent(record());
    expect(api.href).toBe('https://example.com/e');
    expect(api.hrefIsSource).toBe(false);
  });
});
