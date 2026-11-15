import type { EventRecord } from './types';
import { addDays, offsetFor } from './dates';

function escapeIcs(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\\/gu, '\\\\')
    .replace(/;/gu, '\\;')
    .replace(/,/gu, '\\,')
    .replace(/\r?\n/gu, '\\n');
}

function utcStamp(value: string, timezone: string): string {
  const offset = /([+-]\d{2}:\d{2}|Z)$/u.exec(value)?.[1] ?? offsetFor(timezone);
  if (offset === 'Z') return value.replace(/[-:]/gu, '').replace(/\.\d{3}/u, '');
  const sign = offset.startsWith('-') ? -1 : 1;
  const [hours, minutes] = offset.slice(1).split(':').map(Number);
  const instant = new Date(Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)) - 1,
    Number(value.slice(8, 10)),
    Number(value.slice(11, 13)) - sign * (hours ?? 0),
    Number(value.slice(14, 16)) - sign * (minutes ?? 0),
  ));
  return instant.toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}/u, '');
}

/** RFC 5545 feed. All-day events use VALUE=DATE with an exclusive DTEND (end + 1 day). */
export function renderIcs(records: EventRecord[], options: { now?: Date; name?: string } = {}): string {
  const now = options.now ?? new Date();
  const stamp = now.toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}/u, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//happenings//happenings site//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(options.name ?? 'AI Game / Vibe Coding')}`,
  ];

  for (const record of records) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${record.id}@happenings`);
    lines.push(`DTSTAMP:${stamp}`);

    if (record.startTime) {
      const start = utcStamp(`${record.startDate}T${record.startTime}+09:00`, record.timezone);
      const end = utcStamp(`${record.endDate}T${record.startTime}+09:00`, record.timezone);
      lines.push(`DTSTART:${start}`);
      lines.push(`DTEND:${end}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${record.startDate.replace(/-/gu, '')}`);
      lines.push(`DTEND;VALUE=DATE:${addDays(record.endDate, 1).replace(/-/gu, '')}`);
    }

    lines.push(`SUMMARY:${escapeIcs(record.title)}`);
    const place = [record.venue, record.city].filter(Boolean).join(', ');
    if (place) lines.push(`LOCATION:${escapeIcs(place)}`);
    if (record.url) lines.push(`URL:${record.url}`);
    const description = [record.judgement?.why ?? '', record.aiDetail ? `AI: ${record.aiDetail}` : ''].filter(Boolean).join('\n');
    if (description) lines.push(`DESCRIPTION:${escapeIcs(description)}`);
    lines.push(`CATEGORIES:${escapeIcs(record.topics.join(','))}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
