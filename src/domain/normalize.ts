import type { EventRecord, Mode, RawEvent, Region, Topic } from './types';
import { TOPICS } from './types';
import { parseCost, parseDateText, parseSingleDate } from './dates';

const TOPIC_KEYWORDS: Array<[Topic, RegExp]> = [
  ['ai-game', /(AI\s*[×x✕]\s*ゲーム|AIゲーム|ゲームAI|AI\s*game|AIでゲーム|AIゲーム開発)/iu],
  ['vibe-coding', /(バイブコーディング|vibe\s*coding|AI駆動開発|AI\s*coding|生成AIで(アプリ|開発))/iu],
  ['game-jam', /(ゲームジャム|game\s*jam|ジャム)/iu],
  ['hackathon', /(ハッカソン|hackathon|アイディアソン|アイデアソン)/iu],
  ['meetup', /(交流会|ミートアップ|meetup|懇親会|忘年会|ネットワーキング)/iu],
  ['workshop', /(ワークショップ|ハンズオン|workshop|勉強会|入門)/iu],
  ['conference', /(カンファレンス|conference|学会|サミット|summit|フォーラム|forum|展示会|見本市)/iu],
  ['showcase', /(出展|展示|試遊|インディーゲーム|indie)/iu],
  ['contest', /(コンテスト|contest|アワード|award|賞金|グランプリ)/iu],
];

const JP_CITY_RE =
  /(東京|渋谷|新宿|池袋|品川|目黒|港区|千代田|中央区|文京|台東|墨田|江東|世田谷|杉並|中野|高円寺|吉祥寺|豊島|北区|荒川|足立|葛飾|江戸川|大田|八王子|立川|町田|武蔵野|三鷹|調布|横浜|川崎|さいたま|千葉|柏|大阪|梅田|京都|神戸|名古屋|札幌|仙台|広島|福岡|博多|北九州|那覇|沖縄|熊本|鹿児島|長崎|徳島|高松|松山|金沢|新潟|静岡|浜松|岡山|姫路|奈良|大分|宮崎|秋田|青森|盛岡|山形|福井|富山|長野|甲府|岐阜|津|大津|和歌山|鳥取|松江|山口|佐賀|つくば|秋葉原|お台場|六本木|恵比寿|代々木|原宿|青山|銀座|日本橋|丸の内|大手町|有楽町|新橋|虎ノ門|麻布|高輪|田町|目白|早稲田|神保町|御茶ノ水|上野|浅草|押上|錦糸町|豊洲|竹芝|浜松町|天王洲|五反田|大崎|田園調布|自由が丘|三軒茶屋|下北沢|幡ヶ谷|笹塚|明大前|永福町|西荻窪|荻窪|阿佐ヶ谷|鷺ノ宮|都立家政|野方|練馬|石神井|光が丘|赤羽|王子|巣鴨|駒込|田端|西日暮里|日暮里|三河島|南千住|北千住)/u;
const OVERSEAS_RE = /(San Francisco|New York|London|Berlin|Paris|Singapore|Seoul|Taipei|Shanghai|Beijing|Shenzhen|Dubai|Sydney|Toronto)/iu;
const ONLINE_RE = /(オンライン|online|zoom|discord|youtube|配信|remote|リモート|webinar|ウェビナー)/iu;
const ONLINE_RE_G = new RegExp(ONLINE_RE.source, 'giu');

function clean(value: unknown, max: number): string | null {
  if (value == null) return null;
  const text = String(value).replace(/\s+/gu, ' ').trim();
  if (!text) return null;
  return text.slice(0, max);
}

/** Canonical URL: drop tracking params, hash and trailing slash; lowercase host. */
export function canonicalUrl(input: unknown): string | null {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();
  if (!/^https?:\/\//iu.test(raw)) return null;
  try {
    const url = new URL(raw);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    const drop: string[] = [];
    for (const key of url.searchParams.keys()) {
      if (/^(utm_|fbclid|gclid|ref|mc_|_hs)/iu.test(key)) drop.push(key);
    }
    drop.forEach((key) => url.searchParams.delete(key));
    const pathname = url.pathname.replace(/\/+$/u, '') || '/';
    const search = url.searchParams.toString();
    return `${url.protocol}//${url.hostname}${pathname}${search ? `?${search}` : ''}`;
  } catch {
    return null;
  }
}

function titleKey(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u3000]+/gu, '')
    .replace(/[!-/:-@[-`{-~、。・「」『』（）()【】[\]〜~ー\-–—]/gu, '');
}

/** FNV-1a 64-bit, hex — stable across runtimes, no crypto import needed. */
function hash64(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of new TextEncoder().encode(input)) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

export function identityFor(input: { url?: string | null; title: string }): { kind: 'url' | 'title'; value: string } {
  const canonical = canonicalUrl(input.url);
  if (canonical) return { kind: 'url', value: canonical };
  return { kind: 'title', value: titleKey(input.title) };
}

export function eventId(identity: { kind: string; value: string }): string {
  return `evt_${hash64(`${identity.kind}:${identity.value}`)}`;
}

export function inferTopics(text: string, explicit?: string[] | null): Topic[] {
  const picked = new Set<Topic>();
  for (const topic of explicit ?? []) {
    const normalized = String(topic).toLowerCase().trim() as Topic;
    if (TOPICS.includes(normalized)) picked.add(normalized);
  }
  for (const [topic, re] of TOPIC_KEYWORDS) {
    if (re.test(text)) picked.add(topic);
  }
  if (picked.size === 0) picked.add('other');
  return TOPICS.filter((topic) => picked.has(topic));
}

export function inferMode(input: { explicit?: Mode | null; venue?: string | null; city?: string | null; url?: string | null; note?: string | null; title: string }): Mode {
  if (input.explicit && input.explicit !== 'unknown') return input.explicit;
  const venueText = [input.venue, input.city].filter(Boolean).join(' ');
  const hasOnline = ONLINE_RE.test([venueText, input.note, input.title, input.url].filter(Boolean).join(' '));
  const place = venueText.replace(ONLINE_RE_G, ' ').replace(/(参加|配信|視聴)/gu, ' ').trim();
  const hasPlace = place.length > 0;
  if (hasOnline && hasPlace) return 'hybrid';
  if (hasOnline) return 'online';
  if (hasPlace) return 'offline';
  return 'unknown';
}

export function inferRegion(input: { mode: Mode; venue?: string | null; city?: string | null; country?: string | null }): Region {
  if (input.country && /^jp$/iu.test(input.country)) return 'jp';
  if (input.mode === 'online') return 'online';
  const text = [input.city, input.venue].filter(Boolean).join(' ');
  if (JP_CITY_RE.test(text)) return 'jp';
  if (OVERSEAS_RE.test(text)) return 'other';
  if (input.country) return 'other';
  if (input.mode === 'hybrid') return 'online';
  return 'unknown';
}

export function todayIn(timezone = 'Asia/Tokyo', now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export interface NormalizeContext {
  now?: Date;
  defaultYear?: number;
  timezone?: string;
  sourceName?: string | null;
}

/**
 * Raw collector output → EventRecord. Deterministic: no AI, no network.
 * Returns null when the record has no usable title or date.
 */
export function normalizeRaw(raw: RawEvent, context: NormalizeContext = {}): EventRecord | null {
  const { now = new Date(), defaultYear = now.getUTCFullYear(), timezone = 'Asia/Tokyo' } = context;
  const title = clean(raw.title, 300);
  if (!title) return null;

  const url = canonicalUrl(raw.url);
  const sourceUrl = canonicalUrl(raw.sourceUrl) ?? url ?? `urn:source:${hash64(title)}`;
  const dateSource = [raw.dateText, raw.timeText].filter(Boolean).join(' ');
  const parsed = raw.start
    ? {
        start: raw.start,
        end: raw.end ?? null,
        allDay: !raw.start.includes('T'),
        issues: [] as string[],
      }
    : parseDateText(dateSource, { defaultYear, timezone });

  if (!parsed.start) return null;

  const startIso = parsed.start;
  const startDate = startIso.slice(0, 10);
  const startTime = startIso.includes('T') ? startIso.slice(11, 16) : null;
  const endDate = parsed.end ? parsed.end.slice(0, 10) : startDate;

  const deadline = raw.deadline
    ? parseSingleDate(raw.deadline, { defaultYear, timezone })
    : raw.deadlineText
      ? parseSingleDate(raw.deadlineText, { defaultYear, timezone })
      : null;

  const venue = clean(raw.venue, 200);
  const city = clean(raw.city, 100);
  const country = clean(raw.country, 2)?.toUpperCase() ?? null;
  const mode = inferMode({ explicit: raw.mode ?? null, venue, city, url, note: clean(raw.note, 400), title });
  const region = inferRegion({ mode, venue, city, country });
  const topics = inferTopics([title, venue, city, raw.note].filter(Boolean).join(' '), raw.topics);
  const identity = identityFor({ url: raw.url, title });
  const cost = parseCost(clean(raw.costText, 200) ?? '');
  const iso = now.toISOString();

  return {
    id: eventId(identity),
    title,
    startDate,
    endDate,
    startTime,
    timezone,
    mode,
    region,
    venue,
    city,
    costKind: cost.kind,
    costAmount: cost.amount,
    costCurrency: cost.currency,
    deadline,
    url,
    sourceUrl,
    sourceName: clean(raw.sourceName, 120) ?? context.sourceName ?? null,
    topics,
    aiStatus: null,
    aiDetail: null,
    judgement: null,
    firstSeen: iso,
    lastSeen: iso,
    updatedAt: iso,
  };
}
