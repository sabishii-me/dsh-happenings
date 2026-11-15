import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseEventsPage } from '../../src/worker/collectors/chaintokyo';
import { parseSearchPage } from '../../src/worker/collectors/connpass';
import { parseJamList, parseJamRange } from '../../src/worker/collectors/itchio';

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}

describe('connpass parser', () => {
  const items = parseSearchPage(fixture('connpass.html'));

  it('finds server-rendered cards', () => {
    expect(items.length).toBeGreaterThan(3);
  });

  it('extracts title, absolute URL and a JST start', () => {
    const first = items[0]!;
    expect(first.title.length).toBeGreaterThan(0);
    expect(first.url).toMatch(/^https:\/\/.+connpass\.com\/event\/\d+/u);
    expect(first.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u);
    expect(first.sourceName).toBe('connpass');
  });

  it('converts the UTC instant to Tokyo wall clock', () => {
    // fixture's first card carries 2026-11-13T10:30:00Z → 19:30 JST
    const first = items[0]!;
    expect(first.start).toBe('2026-11-13T19:30');
  });
});

describe('chain.tokyo parser', () => {
  const items = parseEventsPage(fixture('chaintokyo.html'));

  it('reads every event card', () => {
    expect(items.length).toBeGreaterThan(10);
  });

  it('uses the "詳細を見る" link as the event URL, not the listing', () => {
    const withLink = items.find((item) => item.url);
    expect(withLink).toBeTruthy();
    expect(withLink!.url).not.toContain('community.chain.tokyo');
  });

  it('carries the date range and the deadline text', () => {
    const garan = items.find((item) => item.title.includes('GaranAI'));
    expect(garan?.dateText).toContain('2026年12月4日');
    expect(garan?.deadlineText).toContain('2026年12月2日');
  });
});

describe('itch.io parsers', () => {
  it('lists featured jams with their closing instant', () => {
    const jams = parseJamList(fixture('itchio.html'));
    expect(jams.length).toBeGreaterThan(5);
    const gameOff = jams.find((jam) => jam.slug === 'game-off-2026');
    expect(gameOff?.title).toBe('Game Off 2026');
    expect(gameOff?.closesAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
  });

  it('reads the submission window from a jam page (minute precision)', () => {
    const range = parseJamRange(fixture('itchio-jam.html'));
    expect(range).toEqual({ opensAt: '2026-11-01T21:37', closesAt: '2026-12-01T21:37' });
  });

  it('returns null rather than guessing when the window is absent', () => {
    expect(parseJamRange('<html><body>nothing here</body></html>')).toBeNull();
  });
});
