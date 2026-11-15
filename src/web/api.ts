import type { ApiEvent, Envelope } from '../domain/types';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export interface Filters {
  topics: string[];
  ai: string | null;
}

export interface MetaInfo {
  generatedAt: string;
  total: number;
  judged: number;
  withAiPolicy: number;
  sources: Array<{ source: string; lastRunAt: string | null; status: string | null; items: number | null; error: string | null }>;
}

function qs(params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export async function fetchEvents(from: string, to: string, filters: Filters): Promise<Envelope> {
  const response = await fetch(
    `${API_BASE}/events${qs({ from, to, topics: filters.topics.join(',') || null, ai: filters.ai })}`,
    { headers: { accept: 'application/json' } },
  );
  if (!response.ok) throw new Error(`GET /api/events → ${response.status}`);
  return (await response.json()) as Envelope;
}

export async function fetchDay(date: string, filters: Filters): Promise<ApiEvent[]> {
  const envelope = await fetchEvents(date, date, filters);
  return envelope.items;
}

export async function fetchMeta(): Promise<MetaInfo> {
  const response = await fetch(`${API_BASE}/meta`, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`GET /api/meta → ${response.status}`);
  return (await response.json()) as MetaInfo;
}

export async function triggerRefresh(): Promise<{ sources: Array<{ source: string; status: string; written: number; error: string | null }> }> {
  const response = await fetch(`${API_BASE}/refresh`, { method: 'POST', headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`POST /api/refresh → ${response.status}`);
  return response.json();
}
