import { parse } from 'node-html-parser';
import type { RawEvent } from '../../domain/types';

const UA = 'Mozilla/5.0 (compatible; happenings-bot/1.0)';

export async function fetchHtml(url: string, timeoutMs = 15_000): Promise<string> {
  const response = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`GET ${url} → ${response.status}`);
  return response.text();
}

/** UTC ISO instant → JST wall-clock date + time. */
export function toJst(value: string): { date: string; time: string } {
  const instant = new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

export interface CollectOptions {
  /** How many detail pages the adapter may fetch; keeps a run cheap. */
  detailBudget?: number;
  now?: Date;
}

export type Collector = {
  id: string;
  label: string;
  collect(options?: CollectOptions): Promise<RawEvent[]>;
};

export type { RawEvent };
export { parse };
