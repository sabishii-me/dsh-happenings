import type { ApiEvent, EventRecord, Judgement, Query, Region, Topic } from '../domain/types';

interface EventRow {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  timezone: string;
  mode: string;
  region: string;
  venue: string | null;
  city: string | null;
  cost_kind: string | null;
  cost_amount: number | null;
  cost_currency: string | null;
  deadline: string | null;
  url: string | null;
  source_url: string;
  source_name: string | null;
  topics: string;
  ai_status: string | null;
  ai_detail: string | null;
  judgement: string | null;
  first_seen: string;
  last_seen: string;
  updated_at: string;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toRecord(row: EventRow): EventRecord {
  return {
    id: row.id,
    title: row.title,
    startDate: row.start_date,
    endDate: row.end_date,
    startTime: row.start_time,
    timezone: row.timezone,
    mode: row.mode as EventRecord['mode'],
    region: row.region as Region,
    venue: row.venue,
    city: row.city,
    costKind: row.cost_kind as EventRecord['costKind'],
    costAmount: row.cost_amount,
    costCurrency: row.cost_currency,
    deadline: row.deadline,
    url: row.url,
    sourceUrl: row.source_url,
    sourceName: row.source_name,
    topics: parseJson<Topic[]>(row.topics, ['other']),
    aiStatus: row.ai_status as EventRecord['aiStatus'],
    aiDetail: row.ai_detail,
    judgement: parseJson<Judgement | null>(row.judgement, null),
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    updatedAt: row.updated_at,
  };
}

/** The link every entry uses: its own page, else its source listing — http(s) only. */
export function eventHref(record: EventRecord): string {
  const candidates = [record.url, record.sourceUrl];
  for (const candidate of candidates) {
    if (candidate && /^https?:\/\//iu.test(candidate)) return candidate;
  }
  return record.sourceUrl;
}

export function toApiEvent(record: EventRecord): ApiEvent {
  const href = eventHref(record);
  return {
    id: record.id,
    title: record.title,
    start: record.startDate,
    endDate: record.endDate,
    startTime: record.startTime,
    allDay: record.startTime == null,
    timezone: record.timezone,
    mode: record.mode,
    region: record.region,
    venue: record.venue,
    city: record.city,
    cost: record.costKind ? { kind: record.costKind, amount: record.costAmount, currency: record.costCurrency } : null,
    deadline: record.deadline,
    url: record.url,
    sourceUrl: record.sourceUrl,
    sourceName: record.sourceName,
    topics: record.topics,
    aiPolicy: record.aiStatus ? { status: record.aiStatus, detail: record.aiDetail } : null,
    judgement: record.judgement,
    href,
    hrefIsSource: href === record.sourceUrl && !record.url,
  };
}

const SELECT_COLUMNS = `id, title, start_date, end_date, start_time, timezone, mode, region, venue, city,
  cost_kind, cost_amount, cost_currency, deadline, url, source_url, source_name, topics,
  ai_status, ai_detail, judgement, first_seen, last_seen, updated_at`;

/** Range query: every event whose [start_date, end_date] overlaps [from, to]. */
export async function queryRange(db: D1Database, query: Query): Promise<{ items: EventRecord[]; total: number }> {
  const totalRow = await db.prepare('SELECT COUNT(*) AS n FROM events').first<{ n: number }>();
  const { results } = await db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM events WHERE end_date >= ? AND start_date <= ? ORDER BY start_date ASC, title ASC`)
    .bind(query.from, query.to)
    .all<EventRow>();

  let records = (results ?? []).map(toRecord);
  if (query.topics.length > 0) {
    records = records.filter((record) => record.topics.some((topic) => query.topics.includes(topic)));
  }
  if (query.ai && query.ai.length > 0) {
    records = records.filter((record) => (record.aiStatus ? query.ai!.includes(record.aiStatus) : query.ai!.includes('unknown')));
  }
  if (query.limit && query.limit > 0) records = records.slice(0, query.limit);
  return { items: records, total: totalRow?.n ?? records.length };
}

export async function getById(db: D1Database, id: string): Promise<EventRecord | null> {
  const row = await db.prepare(`SELECT ${SELECT_COLUMNS} FROM events WHERE id = ?`).bind(id).first<EventRow>();
  return row ? toRecord(row) : null;
}

export async function listAll(db: D1Database): Promise<EventRecord[]> {
  const { results } = await db.prepare(`SELECT ${SELECT_COLUMNS} FROM events ORDER BY start_date ASC`).all<EventRow>();
  return (results ?? []).map(toRecord);
}

export async function listForJudging(db: D1Database, limit = 20): Promise<EventRecord[]> {
  const { results } = await db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM events WHERE judgement IS NULL AND end_date >= ? ORDER BY start_date ASC LIMIT ?`)
    .bind(new Date().toISOString().slice(0, 10), limit)
    .all<EventRow>();
  return (results ?? []).map(toRecord);
}

const UPSERT = `INSERT INTO events (${SELECT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title, start_date = excluded.start_date, end_date = excluded.end_date,
  start_time = excluded.start_time, timezone = excluded.timezone, mode = excluded.mode, region = excluded.region,
  venue = excluded.venue, city = excluded.city, cost_kind = excluded.cost_kind, cost_amount = excluded.cost_amount,
  cost_currency = excluded.cost_currency, deadline = excluded.deadline,
  url = COALESCE(excluded.url, events.url),
  source_url = excluded.source_url, source_name = COALESCE(excluded.source_name, events.source_name),
  topics = excluded.topics,
  ai_status = COALESCE(excluded.ai_status, events.ai_status),
  ai_detail = COALESCE(excluded.ai_detail, events.ai_detail),
  judgement = COALESCE(excluded.judgement, events.judgement),
  last_seen = excluded.last_seen, updated_at = excluded.updated_at`;

function values(record: EventRecord): unknown[] {
  return [
    record.id,
    record.title,
    record.startDate,
    record.endDate,
    record.startTime,
    record.timezone,
    record.mode,
    record.region,
    record.venue,
    record.city,
    record.costKind,
    record.costAmount,
    record.costCurrency,
    record.deadline,
    record.url,
    record.sourceUrl,
    record.sourceName,
    JSON.stringify(record.topics),
    record.aiStatus,
    record.aiDetail,
    record.judgement ? JSON.stringify(record.judgement) : null,
    record.firstSeen,
    record.lastSeen,
    record.updatedAt,
  ];
}

/** Idempotent upsert: identity is the id, so re-running a collector cannot duplicate. */
export async function upsertMany(db: D1Database, records: EventRecord[]): Promise<{ written: number }> {
  if (records.length === 0) return { written: 0 };
  const statements = records.map((record) => db.prepare(UPSERT).bind(...values(record)));
  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }
  return { written: records.length };
}

export async function saveJudgement(
  db: D1Database,
  id: string,
  judgement: Judgement | null,
  aiStatus: EventRecord['aiStatus'],
  aiDetail: string | null,
  now = new Date(),
): Promise<void> {
  await db
    .prepare('UPDATE events SET judgement = ?, ai_status = COALESCE(?, ai_status), ai_detail = COALESCE(?, ai_detail), updated_at = ? WHERE id = ?')
    .bind(judgement ? JSON.stringify(judgement) : null, aiStatus, aiDetail, now.toISOString(), id)
    .run();
}

export interface IngestRun {
  source: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'ok' | 'error' | 'skipped';
  items: number;
  error: string | null;
}

export async function startRun(db: D1Database, source: string, now = new Date()): Promise<number> {
  const result = await db
    .prepare('INSERT INTO ingest_runs (source, started_at, status, items) VALUES (?, ?, ?, 0)')
    .bind(source, now.toISOString(), 'running')
    .run();
  return Number(result.meta.last_row_id ?? 0);
}

export async function finishRun(db: D1Database, id: number, run: Omit<IngestRun, 'id' | 'source' | 'startedAt'>): Promise<void> {
  await db
    .prepare('UPDATE ingest_runs SET finished_at = ?, status = ?, items = ?, error = ? WHERE id = ?')
    .bind(run.finishedAt, run.status, run.items, run.error, id)
    .run();
}

export interface MetaInfo {
  generatedAt: string;
  total: number;
  judged: number;
  withAiPolicy: number;
  sources: Array<{ source: string; lastRunAt: string | null; status: string | null; items: number | null; error: string | null }>;
}

export async function meta(db: D1Database, now = new Date()): Promise<MetaInfo> {
  const counts = await db
    .prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN judgement IS NOT NULL THEN 1 ELSE 0 END) AS judged, SUM(CASE WHEN ai_status IS NOT NULL THEN 1 ELSE 0 END) AS withAi FROM events')
    .first<{ total: number; judged: number | null; withAi: number | null }>();
  const { results } = await db
    .prepare(
      `SELECT source, finished_at, status, items, error FROM ingest_runs r
       WHERE started_at = (SELECT MAX(started_at) FROM ingest_runs WHERE source = r.source)
       ORDER BY source`,
    )
    .all<{ source: string; finished_at: string | null; status: string; items: number; error: string | null }>();

  return {
    generatedAt: now.toISOString(),
    total: counts?.total ?? 0,
    judged: counts?.judged ?? 0,
    withAiPolicy: counts?.withAi ?? 0,
    sources: (results ?? []).map((row) => ({
      source: row.source,
      lastRunAt: row.finished_at,
      status: row.status,
      items: row.items,
      error: row.error,
    })),
  };
}
