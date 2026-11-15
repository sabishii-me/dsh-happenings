// Date parsing for real event pages: "2026年12月4日（金）夕方〜6日（日）午後",
// "11/14(土)–11/15(日)", "2027/3/27-28". Deterministic; no AI involved.

const DATE_RE = new RegExp(
  [
    '(?<y>\\d{4})\\s*[年\\/.-]\\s*(?<m>\\d{1,2})\\s*[月\\/.-]\\s*(?<d>\\d{1,2})\\s*日?',
    '(?<m2>\\d{1,2})\\s*月\\s*(?<d2>\\d{1,2})\\s*日?',
    '(?<m3>\\d{1,2})\\s*\\/\\s*(?<d3>\\d{1,2})(?!\\s*\\/)',
    '(?<d4>\\d{1,2})\\s*日(?!間|目)',
  ].join('|'),
  'gu',
);

const TIME_RE = /(?<h>\d{1,2})\s*[:：]\s*(?<mi>\d{2})/gu;

const TZ_OFFSET: Record<string, string> = {
  'Asia/Tokyo': '+09:00',
  'Asia/Seoul': '+09:00',
  'Asia/Shanghai': '+08:00',
  'Asia/Taipei': '+08:00',
  UTC: '+00:00',
  'Europe/London': '+00:00',
};

export function offsetFor(timezone: string, fallback = '+09:00'): string {
  return TZ_OFFSET[timezone] ?? fallback;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

interface Candidate {
  raw: string;
  index: number;
  y: number | null;
  m: number | null;
  d: number;
  explicitYear: boolean;
  explicitMonth: boolean;
}

function collect(text: string): Candidate[] {
  const found: Candidate[] = [];
  for (const match of text.matchAll(DATE_RE)) {
    const g = match.groups ?? {};
    const monthGroup = g.m ?? g.m2 ?? g.m3;
    found.push({
      raw: match[0],
      index: match.index ?? 0,
      y: g.y ? Number(g.y) : null,
      m: monthGroup == null ? null : Number(monthGroup),
      d: Number(g.d ?? g.d2 ?? g.d3 ?? g.d4),
      explicitYear: Boolean(g.y),
      explicitMonth: monthGroup != null,
    });
  }
  return found;
}

function collectTimes(text: string): string[] {
  const times: string[] = [];
  for (const match of text.matchAll(TIME_RE)) {
    const h = Number(match.groups?.h);
    const mi = Number(match.groups?.mi);
    if (h > 23 || mi > 59) continue;
    times.push(`${pad(h)}:${pad(mi)}`);
  }
  return times;
}

export interface ParsedDates {
  start: string | null;
  end: string | null;
  allDay: boolean;
  issues: string[];
}

export function parseDateText(text: string | null | undefined, options: { defaultYear?: number; timezone?: string } = {}): ParsedDates {
  const { defaultYear = new Date().getUTCFullYear(), timezone = 'Asia/Tokyo' } = options;
  const issues: string[] = [];
  if (!text) return { start: null, end: null, allDay: true, issues: ['empty date text'] };

  const found = collect(text);
  if (found.length === 0) return { start: null, end: null, allDay: true, issues: [`no date found in "${text}"`] };

  // "2027/3/27-28": the range tail is a bare day number.
  const first = found[0];
  if (found.length === 1 && first) {
    const tail = /[〜~–—-]\s*(\d{1,2})\s*(?:日|\(|（|$)/u.exec(text.slice((first.index ?? 0) + first.raw.length));
    if (tail) {
      const day = Number(tail[1]);
      const candidate: Candidate = {
        raw: tail[0],
        index: text.length,
        y: first.y ?? defaultYear,
        m: first.m ?? 1,
        d: day,
        explicitYear: false,
        explicitMonth: false,
      };
      if (isRealDate(candidate.y as number, candidate.m as number, candidate.d)) found.push(candidate);
    }
  }

  let lastYear: number | null = null;
  let lastMonth: number | null = null;
  for (const item of found) {
    if (item.y == null) item.y = lastYear ?? defaultYear;
    if (item.m == null) item.m = lastMonth ?? 1;
    lastYear = item.y;
    lastMonth = item.m;
  }

  for (let i = 1; i < found.length; i += 1) {
    const prev = found[i - 1];
    const cur = found[i];
    if (!prev || !cur) continue;
    if (!cur.explicitMonth && cur.m != null && prev.m != null && cur.m < prev.m) {
      const bumped = cur.m + 1;
      if (bumped <= 12) cur.m = bumped;
    }
  }

  const valid = found.filter((item) => {
    const ok = isRealDate(item.y as number, item.m as number, item.d);
    if (!ok) issues.push(`invalid date "${item.raw}"`);
    return ok;
  }) as Array<Candidate & { y: number; m: number }>;
  const firstValid = valid[0];
  const lastValid = valid[valid.length - 1];
  if (!firstValid || !lastValid) return { start: null, end: null, allDay: true, issues };

  const times = collectTimes(text);
  const allDay = times.length === 0;
  const offset = offsetFor(timezone);
  const toDay = (item: { y: number; m: number; d: number }) => `${item.y}-${pad(item.m)}-${pad(item.d)}`;
  const withTime = (day: string, time: string | null | undefined) => (time ? `${day}T${time}${offset}` : day);

  const startDay = toDay(firstValid);
  const endDay = valid.length > 1 ? toDay(lastValid) : null;
  const start = withTime(startDay, times[0] ?? null);
  const endTime = times.length > 1 && endDay ? times[1] : null;
  let end = endDay ? withTime(endDay, endTime) : null;
  if (end && endDay === startDay && !endTime) end = null;

  if (found.some((item) => !item.explicitMonth)) issues.push('inferred month for a bare day');

  return { start, end, allDay, issues };
}

export function parseSingleDate(text: string | null | undefined, options: { defaultYear?: number; timezone?: string } = {}): string | null {
  const parsed = parseDateText(text, options);
  return parsed.start ? parsed.start.slice(0, 10) : null;
}

export interface ParsedCost {
  kind: 'free' | 'paid' | 'unknown';
  amount: number | null;
  currency: string | null;
  note: string | null;
}

const FREE_RE = /(無料|免费|免費|free|0\s*円|入場無料|参加無料)/iu;
const PAID_RE = /(?:[¥￥$]\s*(?<amount1>[\d,]+)|(?<amount2>[\d,]+)\s*円|(?<amount3>[\d,]+)\s*(?:JPY|USD))/iu;

export function parseCost(text: string | null | undefined): ParsedCost {
  if (!text) return { kind: 'unknown', amount: null, currency: null, note: null };
  const note = text.trim().slice(0, 200) || null;
  if (FREE_RE.test(text)) return { kind: 'free', amount: 0, currency: null, note };
  const match = PAID_RE.exec(text);
  if (match?.groups) {
    const digits = match.groups.amount1 ?? match.groups.amount2 ?? match.groups.amount3;
    const amount = Number(String(digits).replace(/,/g, ''));
    const currency = match[0].includes('$') || /USD/iu.test(match[0]) ? 'USD' : 'JPY';
    if (Number.isFinite(amount)) return { kind: 'paid', amount, currency, note };
  }
  return { kind: 'unknown', amount: null, currency: null, note };
}

/** Add days to a YYYY-MM-DD string (FullCalendar's all-day end is exclusive). */
export function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}
