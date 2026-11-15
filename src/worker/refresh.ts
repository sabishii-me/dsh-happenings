import type { Env } from './env';
import { findCollectors } from './collectors';
import type { Collector } from './collectors/base';
import { normalizeRaw } from '../domain/normalize';
import type { EventRecord, RawEvent } from '../domain/types';
import { finishRun, startRun, upsertMany } from './store';
import { judgePending } from './judge';
import { mergeDuplicates } from './dedupe';

export interface SourceResult {
  source: string;
  status: 'ok' | 'error' | 'skipped';
  items: number;
  written: number;
  error: string | null;
}

export interface RefreshResult {
  startedAt: string;
  finishedAt: string;
  sources: SourceResult[];
  written: number;
  judged: number;
  merged: number;
}

async function runOne(env: Env, collector: Collector, now: Date): Promise<SourceResult> {
  const runId = await startRun(env.DB, collector.id, now);
  try {
    const raw = await collector.collect({ now });
    if (raw.length === 0) {
      await finishRun(env.DB, runId, { finishedAt: new Date().toISOString(), status: 'skipped', items: 0, error: null });
      return { source: collector.id, status: 'skipped', items: 0, written: 0, error: null };
    }
    const records = raw
      .map((item: RawEvent) => normalizeRaw(item, { now, sourceName: collector.label }))
      .filter((record): record is EventRecord => record !== null);

    const { written } = await upsertMany(env.DB, records);
    await finishRun(env.DB, runId, { finishedAt: new Date().toISOString(), status: 'ok', items: raw.length, error: null });
    return { source: collector.id, status: 'ok', items: raw.length, written, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRun(env.DB, runId, { finishedAt: new Date().toISOString(), status: 'error', items: 0, error: message });
    return { source: collector.id, status: 'error', items: 0, written: 0, error: message };
  }
}

/**
 * Collect → normalize → upsert → judge, one source at a time.
 * A failing source records an error and leaves existing rows untouched.
 */
export async function runRefresh(env: Env, options: { collectors?: string | null; now?: Date; judge?: boolean } = {}): Promise<RefreshResult> {
  const now = options.now ?? new Date();
  const collectors = findCollectors(options.collectors ?? env.COLLECTORS ?? null);
  const sources: SourceResult[] = [];

  for (const collector of collectors) {
    sources.push(await runOne(env, collector, now));
  }

  let judged = 0;
  if (options.judge !== false) {
    judged = await judgePending(env, { now, limit: 5 }).catch(() => 0);
  }

  // The same event reached us from a news article and from the jam page: fold the
  // duplicates after every run so the calendar shows one bar per event.
  const { merged } = await mergeDuplicates(env.DB).catch(() => ({ merged: 0 }));

  return {
    startedAt: now.toISOString(),
    finishedAt: new Date().toISOString(),
    sources,
    written: sources.reduce((sum, source) => sum + source.written, 0),
    judged,
    merged,
  };
}
