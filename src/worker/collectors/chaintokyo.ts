import { fetchHtml, parse, type Collector, type RawEvent } from './base';

const PAGES = ['https://community.chain.tokyo/events', 'https://community.chain.tokyo/hacks'];

/**
 * chain.tokyo renders `article.event-card` server-side, with the date, venue and
 * deadline as text next to Remix icon elements, and a "詳細を見る" link that points
 * at the event's own page (so we get a real event URL, not the aggregator).
 */
export function parseEventsPage(html: string): RawEvent[] {
  const root = parse(html);
  const items: RawEvent[] = [];

  for (const card of root.querySelectorAll('article.event-card')) {
    const title = card.querySelector('h3')?.text.trim();
    if (!title) continue;

    const link = [...card.querySelectorAll('a')].find((anchor) => /詳細を見る/u.test(anchor.text));
    const href = link?.getAttribute('href') ?? null;

    const lineOf = (icon: string): string | null => {
      const iconEl = card.querySelector(`i.${icon}`);
      const parent = iconEl?.parentNode;
      const text = parent ? parent.text.replace(/\s+/gu, ' ').trim() : '';
      return text || null;
    };

    const dateText = lineOf('ri-calendar-line');
    const place = lineOf('ri-map-pin-line');
    const deadlineLine = lineOf('ri-timer-line');
    const deadlineText = deadlineLine ? deadlineLine.replace(/^締切\s*/u, '') : null;

    const tags = [...card.querySelectorAll('span')]
      .map((span) => span.text.trim())
      .filter((text) => text && !/^(開催中|開催前|終了)$/u.test(text) && text.length < 24);

    items.push({
      title,
      url: href,
      dateText,
      deadlineText,
      venue: place,
      city: place,
      note: tags.join(' / ') || null,
      topics: tags,
      sourceName: 'chain.tokyo',
      sourceUrl: 'https://community.chain.tokyo/',
    });
  }
  return items;
}

export const chainTokyoCollector: Collector = {
  id: 'chain-tokyo',
  label: 'community.chain.tokyo',
  async collect() {
    const seen = new Map<string, RawEvent>();
    for (const page of PAGES) {
      try {
        const html = await fetchHtml(page);
        for (const item of parseEventsPage(html)) {
          if (!seen.has(item.url ?? item.title)) seen.set(item.url ?? item.title, item);
        }
      } catch {
        // keep going: one page failing must not kill the run
      }
    }
    return [...seen.values()];
  },
};
