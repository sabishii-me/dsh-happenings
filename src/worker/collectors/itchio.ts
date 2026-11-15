import { fetchHtml, parse, type CollectOptions, type Collector, type RawEvent } from './base';

const LIST_URL = 'https://itch.io/jams';
const JAM_LIMIT = 6;

/**
 * itch.io's jam list only shows the closing instant, so we take the jam page for
 * the "Submissions open from X to Y" range. Jams whose range cannot be read are
 * skipped rather than guessed.
 */
export function parseJamList(html: string): Array<{ slug: string; title: string; closesAt: string | null; hostedBy: string | null }> {
  const root = parse(html);
  const jams: Array<{ slug: string; title: string; closesAt: string | null; hostedBy: string | null }> = [];

  for (const card of root.querySelectorAll('.jam')) {
    const link = card.querySelector('h3 a');
    if (!link) continue;
    const href = link.getAttribute('href') ?? '';
    const match = /^\/jam\/([^/?#]+)/u.exec(href);
    if (!match || !match[1]) continue;
    jams.push({
      slug: match[1],
      title: link.text.trim(),
      closesAt: card.querySelector('.date_countdown')?.text.trim() ?? null,
      hostedBy: card.querySelector('.hosted_by')?.text.replace(/^Hosted by\s*/u, '').trim() ?? null,
    });
  }
  return jams;
}

export function parseJamRange(html: string): { opensAt: string; closesAt: string } | null {
  // The jam page splits the sentence across spans, so read the flattened text.
  const text = parse(html).textContent.replace(/\s+/gu, ' ');
  const match = /Submissions open from ([\d-]+)(?: ([ \d:]+))? to ([\d-]+)(?: ([ \d:]+))?/u.exec(text);
  if (!match) return null;
  const [, openDate, openTimeRaw, closeDate, closeTimeRaw] = match;
  const openTime = (openTimeRaw ?? '').trim() || '00:00';
  const closeTime = (closeTimeRaw ?? '').trim() || '23:59';
  return { opensAt: `${openDate}T${openTime.slice(0, 5)}`, closesAt: `${closeDate}T${closeTime.slice(0, 5)}` };
}

export const itchIoCollector: Collector = {
  id: 'itchio',
  label: 'itch.io jams',
  async collect(options: CollectOptions = {}) {
    const budget = options.detailBudget ?? JAM_LIMIT;
    const now = options.now ?? new Date();
    const html = await fetchHtml(LIST_URL);
    const listed = parseJamList(html)
      .filter((jam) => jam.closesAt && new Date(jam.closesAt) >= now)
      .slice(0, budget);

    const items: RawEvent[] = [];
    for (const jam of listed) {
      const url = `https://itch.io/jam/${jam.slug}`;
      try {
        const page = await fetchHtml(url, 12_000);
        const range = parseJamRange(page);
        if (!range) continue; // no range → do not invent one
        // A jam submission window is a date range, not a clock: keep it all-day.
        const opensOn = range.opensAt.slice(0, 10);
        const closesOn = range.closesAt.slice(0, 10);
        items.push({
          title: jam.title,
          url,
          dateText: `${opensOn} — ${closesOn}`,
          deadlineText: closesOn,
          note: jam.hostedBy ? `Hosted by ${jam.hostedBy}` : null,
          mode: 'online',
          topics: ['game-jam'],
          sourceName: 'itch.io',
          sourceUrl: LIST_URL,
        });
      } catch {
        continue;
      }
    }
    return items;
  },
};
