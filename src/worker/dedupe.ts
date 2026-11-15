import type { D1Database } from '@cloudflare/workers-types';

/**
 * The same event can arrive from a news article, an aggregator listing and the
 * jam page itself. Identity is URL-based, so those become separate rows. This pass
 * folds rows that share a title fingerprint and whose dates are close, keeping the
 * row that carries the most information (own page > aggregator, judged > unjudged).
 */

function fingerprint(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^\d{4}\s*/u, '') // "2026 Epic AI MegaJam"
    .replace(/\b(github|itch\.io|itchio)\b/gu, '') // "GitHub Game Off" vs "Game Off"
    .replace(/[\s\u3000]+/gu, '')
    .replace(/[!-/:-@[-`{-~、。・「」『』（）()【】[\]]/gu, '')
    .replace(/[〜~ー\-–—]/gu, '');
}

interface Row {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  topics: string;
  url: string | null;
  source_url: string;
  judgement: string | null;
  ai_status: string | null;
  ai_detail: string | null;
  first_seen: string;
}

const AGGREGATOR_HINT = /\/(jams?|events?|search)\/?$|community\.chain\.tokyo|4gamer\.net|note\.com|ci-en\.net|tech\.yahoo/u;

function score(row: Row): number {
  let value = 0;
  if (row.url && !AGGREGATOR_HINT.test(row.url)) value += 4; // own event page
  if (row.judgement) value += 2;
  if (row.ai_status) value += 1;
  // A wider window beats a single-day placeholder.
  value += row.end_date > row.start_date ? 1 : 0;
  return value;
}

function dayGap(a: string, b: string): number {
  const left = Date.parse(`${a}T00:00:00Z`);
  const right = Date.parse(`${b}T00:00:00Z`);
  return Math.abs(left - right) / 86_400_000;
}

function close(a: Row, b: Row): boolean {
  if (a.start_date <= b.end_date && b.start_date <= a.end_date) return true; // overlap
  return dayGap(a.start_date, b.start_date) <= 10 || dayGap(a.end_date, b.end_date) <= 10;
}

export async function mergeDuplicates(db: D1Database): Promise<{ merged: number }> {
  const { results } = await db
    .prepare('SELECT id, title, start_date, end_date, topics, url, source_url, judgement, ai_status, ai_detail, first_seen FROM events')
    .all<Row>();
  const rows = results ?? [];

  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = fingerprint(row.title);
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  let merged = 0;
  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue;

    // Cluster by proximity so a jam and its later re-run stay separate.
    const clusters: Row[][] = [];
    for (const row of bucket) {
      const target = clusters.find((cluster) => cluster.some((member) => close(member, row)));
      if (target) target.push(row);
      else clusters.push([row]);
    }

    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      const sorted = [...cluster].sort((a, b) => score(b) - score(a) || a.first_seen.localeCompare(b.first_seen));
      const keeper = sorted[0]!;
      const topics = new Set<string>();
      for (const row of sorted) {
        try {
          for (const topic of JSON.parse(row.topics) as string[]) topics.add(topic);
        } catch {
          // ignore malformed topics
        }
      }

      let url = keeper.url;
      let aiStatus = keeper.ai_status;
      let aiDetail = keeper.ai_detail;
      let judgement = keeper.judgement;
      for (const row of sorted.slice(1)) {
        if (!url && row.url) url = row.url;
        if (!aiStatus && row.ai_status) aiStatus = row.ai_status;
        if (!aiDetail && row.ai_detail) aiDetail = row.ai_detail;
        // A judgement made against the aggregator row is still a judgement.
        if (!judgement && row.judgement) judgement = row.judgement;
      }

      await db
        .prepare('UPDATE events SET topics = ?, url = ?, ai_status = ?, ai_detail = ?, judgement = ? WHERE id = ?')
        .bind(JSON.stringify([...topics]), url, aiStatus, aiDetail, judgement, keeper.id)
        .run();

      for (const row of sorted.slice(1)) {
        await db.prepare('DELETE FROM events WHERE id = ?').bind(row.id).run();
        merged += 1;
      }
    }
  }

  return { merged };
}
