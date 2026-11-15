/** Shared domain and API types. */

export type Mode = 'offline' | 'online' | 'hybrid' | 'unknown';
export type Region = 'jp' | 'online' | 'other' | 'unknown';
export type AiStatus = 'allowed' | 'restricted' | 'forbidden' | 'unknown';

export const TOPICS = [
  'ai-game',
  'vibe-coding',
  'hackathon',
  'game-jam',
  'meetup',
  'workshop',
  'conference',
  'showcase',
  'contest',
  'other',
] as const;
export type Topic = (typeof TOPICS)[number];

export interface Judgement {
  relevance: number;
  fit: 'high' | 'medium' | 'low';
  why: string;
  audience?: string[];
  risks?: string[];
  confidence?: number | null;
  model?: string | null;
  judgedAt?: string | null;
}

/** What a collector hands over. Only `title` is required. */
export interface RawEvent {
  title: string;
  url?: string | null;
  sourceUrl?: string | null;
  sourceName?: string | null;
  dateText?: string | null;
  timeText?: string | null;
  start?: string | null;
  end?: string | null;
  deadline?: string | null;
  deadlineText?: string | null;
  venue?: string | null;
  city?: string | null;
  country?: string | null;
  mode?: Mode | null;
  costText?: string | null;
  note?: string | null;
  topics?: string[];
}

/** One row of the `events` table, in camelCase. Dates are inclusive. */
export interface EventRecord {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD, inclusive; equals startDate for one-day events
  startTime: string | null; // HH:mm in `timezone`
  timezone: string;
  mode: Mode;
  region: Region;
  venue: string | null;
  city: string | null;
  costKind: 'free' | 'paid' | 'unknown' | null;
  costAmount: number | null;
  costCurrency: string | null;
  deadline: string | null;
  url: string | null;
  sourceUrl: string;
  sourceName: string | null;
  topics: Topic[];
  aiStatus: AiStatus | null;
  aiDetail: string | null;
  judgement: Judgement | null;
  firstSeen: string;
  lastSeen: string;
  updatedAt: string;
}

export interface Query {
  from: string;
  to: string;
  topics: Topic[];
  ai: AiStatus[] | null;
  limit?: number | null;
}

export interface Envelope {
  schemaVersion: '1.0.0';
  generatedAt: string;
  query: {
    from: string;
    to: string;
    region: Region[];
    topics: Topic[];
    includePast: boolean;
    limit: number | null;
  };
  items: ApiEvent[];
  diagnostics: Diagnostic[];
  stats: { total: number; matched: number; judged: number };
}

export interface Diagnostic {
  level: 'info' | 'warn' | 'error';
  code: string;
  message: string;
  ref?: string | null;
}

/** The JSON shape the API returns and FullCalendar consumes indirectly. */
export interface ApiEvent {
  id: string;
  title: string;
  start: string;
  endDate: string;
  startTime: string | null;
  allDay: boolean;
  timezone: string;
  mode: Mode;
  region: Region;
  venue: string | null;
  city: string | null;
  cost: { kind: string; amount: number | null; currency: string | null } | null;
  deadline: string | null;
  url: string | null;
  sourceUrl: string;
  sourceName: string | null;
  topics: Topic[];
  aiPolicy: { status: AiStatus; detail: string | null } | null;
  judgement: Judgement | null;
  href: string;
  hrefIsSource: boolean;
}
