import { chainTokyoCollector } from './chaintokyo';
import { connpassCollector } from './connpass';
import { itchIoCollector } from './itchio';
import type { Collector } from './base';

export const COLLECTORS: Collector[] = [chainTokyoCollector, connpassCollector, itchIoCollector];

export function findCollectors(ids?: string | null): Collector[] {
  if (!ids) return COLLECTORS;
  const wanted = new Set(ids.split(',').map((id) => id.trim()).filter(Boolean));
  return COLLECTORS.filter((collector) => wanted.has(collector.id));
}
