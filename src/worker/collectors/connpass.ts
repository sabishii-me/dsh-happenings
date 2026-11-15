import { fetchHtml, parse, toJst, type Collector, type RawEvent } from './base';

const KEYWORDS = ['バイブコーディング', 'AIゲーム', 'ハッカソン'];
const BASE = 'https://connpass.com/search/';

/** connpass search pages are server-rendered: `.event_list.vevent` cards. */
function parseSearchPage(html: string): RawEvent[] {
  const root = parse(html);
  const items: RawEvent[] = [];

  for (const card of root.querySelectorAll('.event_list.vevent')) {
    const link = card.querySelector('.event_title a.url') ?? card.querySelector('.event_title a');
    const title = link?.text.trim();
    if (!title || !link) continue;
    const href = link.getAttribute('href') ?? '';
    const absolute = href.startsWith('http') ? href : `https://connpass.com${href}`;

    const iso = card.querySelector('.dtstart .value-title')?.getAttribute('title');
    const start = iso ? toJst(iso) : null;
    const place = card.querySelector('.event_place')?.text.replace(/\s+/gu, ' ').trim() ?? null;
    const series = card.querySelector('.series_title')?.text.trim() ?? null;

    items.push({
      title,
      url: absolute,
      dateText: start ? start.date : null,
      start: start ? `${start.date}T${start.time}` : null,
      venue: place,
      city: place,
      note: series,
      sourceName: 'connpass',
      sourceUrl: 'https://connpass.com/',
    });
  }
  return items;
}

export const connpassCollector: Collector = {
  id: 'connpass',
  label: 'connpass',
  async collect(options = {}) {
    const now = options.now ?? new Date();
    const startFrom = now.toISOString().slice(0, 10);
    const seen = new Map<string, RawEvent>();

    for (const keyword of KEYWORDS) {
      const url = `${BASE}?q=${encodeURIComponent(keyword)}&start_from=${startFrom}`;
      let html: string;
      try {
        html = await fetchHtml(url);
      } catch {
        continue; // one keyword failing must not kill the run
      }
      for (const item of parseSearchPage(html)) {
        if (!seen.has(item.url ?? item.title)) seen.set(item.url ?? item.title, item);
      }
    }
    return [...seen.values()];
  },
};

export { parseSearchPage };
