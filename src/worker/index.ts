import { Hono } from 'hono';
import type { Env } from './env';
import type { AiStatus, Envelope, Query, Topic } from '../domain/types';
import { TOPICS } from '../domain/types';
import { getById, listAll, meta, queryRange, toApiEvent } from './store';
import { renderIcs } from '../domain/ics';
import { runRefresh } from './refresh';
import { todayIn } from '../domain/normalize';
import { addDays } from '../domain/dates';

const app = new Hono<{ Bindings: Env }>();

function parseList(value: string | undefined, allowed: readonly string[]): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => allowed.includes(part));
}

function parseRange(url: URL, now = new Date()): { from: string; to: string } {
  const today = todayIn('Asia/Tokyo', now);
  const from = url.searchParams.get('from') ?? today;
  const to = url.searchParams.get('to') ?? addDays(from, 90);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(from) || !/^\d{4}-\d{2}-\d{2}$/u.test(to)) {
    throw new Error('from/to must be YYYY-MM-DD');
  }
  if (to < from) throw new Error('to must be after from');
  return { from, to };
}

app.get('/api/health', (c) => c.json({ ok: true, service: 'happenings', schemaVersion: '1.0.0' }));

app.get('/api/events', async (c) => {
  const now = new Date();
  let range: { from: string; to: string };
  try {
    range = parseRange(new URL(c.req.url), now);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'bad range' }, 400);
  }

  const topics = parseList(c.req.query('topics'), TOPICS) as Topic[];
  const aiList = parseList(c.req.query('ai'), ['allowed', 'restricted', 'forbidden', 'unknown']) as AiStatus[];
  const limitParam = Number(c.req.query('limit') ?? '');
  const query: Query = {
    from: range.from,
    to: range.to,
    topics,
    ai: aiList.length > 0 ? aiList : null,
    limit: Number.isInteger(limitParam) && limitParam > 0 ? limitParam : null,
  };

  const { items, total } = await queryRange(c.env.DB, query);
  const envelope: Envelope = {
    schemaVersion: '1.0.0',
    generatedAt: now.toISOString(),
    query: { from: range.from, to: range.to, region: ['jp', 'online', 'other', 'unknown'], topics, includePast: true, limit: query.limit ?? null },
    items: items.map(toApiEvent),
    diagnostics: [],
    stats: { total, matched: items.length, judged: items.filter((item) => item.judgement).length },
  };
  return c.json(envelope);
});

app.get('/api/events/:id', async (c) => {
  const record = await getById(c.env.DB, c.req.param('id'));
  if (!record) return c.json({ error: 'not found' }, 404);
  return c.json(toApiEvent(record));
});

app.get('/api/meta', async (c) => c.json(await meta(c.env.DB)));

app.get('/api/ics', async (c) => {
  const now = new Date();
  const records = await listAll(c.env.DB);
  const body = renderIcs(records, { now });
  return new Response(body, {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'inline; filename="happenings.ics"' },
  });
});

app.get('/api/export', async (c) => {
  const records = await listAll(c.env.DB);
  return c.json({ schemaVersion: '1.0.0', generatedAt: new Date().toISOString(), items: records.map(toApiEvent) });
});

app.post('/api/refresh', async (c) => {
  const token = c.env.ADMIN_TOKEN;
  if (token && c.req.header('x-admin-token') !== token) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const only = c.req.query('collectors') ?? null;
  try {
    const result = await runRefresh(c.env, { collectors: only });
    return c.json(result);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'refresh failed' }, 500);
  }
});

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runRefresh(env, { now: new Date(controller.scheduledTime) }).then(() => undefined));
  },
};
