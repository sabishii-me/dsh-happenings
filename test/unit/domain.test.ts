import { describe, expect, it } from 'vitest';
import { addDays, parseCost, parseDateText } from '../../src/domain/dates';
import { toCalendarEvent } from '../../src/domain/calendar-map';
import type { ApiEvent } from '../../src/domain/types';

const opts = { defaultYear: 2026, timezone: 'Asia/Tokyo' };

describe('parseDateText', () => {
  it('parses a Japanese range with a day-only continuation', () => {
    const parsed = parseDateText('2026年12月4日（金）夕方〜6日（日）午後', opts);
    expect(parsed.start).toBe('2026-12-04');
    expect(parsed.end).toBe('2026-12-06');
    expect(parsed.allDay).toBe(true);
  });

  it('parses slash ranges', () => {
    const parsed = parseDateText('11/14(土)–11/15(日)', opts);
    expect(parsed.start).toBe('2026-11-14');
    expect(parsed.end).toBe('2026-11-15');
  });

  it('parses a year-first range with a bare end day', () => {
    const parsed = parseDateText('2027/3/27-28', opts);
    expect(parsed.start).toBe('2027-03-27');
    expect(parsed.end).toBe('2027-03-28');
  });

  it('keeps the time with the Tokyo offset', () => {
    expect(parseDateText('2026年11月18日 19:00', opts).start).toBe('2026-11-18T19:00+09:00');
  });

  it('does not read "3日間" as a date', () => {
    expect(parseDateText('開催期間は3日間です', opts).start).toBeNull();
  });

  it('rejects impossible dates', () => {
    expect(parseDateText('2026年2月31日', opts).start).toBeNull();
  });
});

describe('parseCost', () => {
  it('separates free, paid and unknown', () => {
    expect(parseCost('参加費無料').kind).toBe('free');
    expect(parseCost('参加費 ¥1,000')).toMatchObject({ kind: 'paid', amount: 1000, currency: 'JPY' });
    expect(parseCost('$65,000 賞金')).toMatchObject({ kind: 'paid', amount: 65000, currency: 'USD' });
    expect(parseCost('').kind).toBe('unknown');
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

function apiEvent(overrides: Partial<ApiEvent>): ApiEvent {
  return {
    id: 'evt_1',
    title: 'Event',
    start: '2026-12-04',
    endDate: '2026-12-04',
    startTime: null,
    allDay: true,
    timezone: 'Asia/Tokyo',
    mode: 'offline',
    region: 'jp',
    venue: null,
    city: null,
    cost: null,
    deadline: null,
    url: 'https://example.com/x',
    sourceUrl: 'https://example.com/x',
    sourceName: null,
    topics: ['meetup'],
    aiPolicy: null,
    judgement: null,
    href: 'https://example.com/x',
    hrefIsSource: false,
    ...overrides,
  };
}

describe('toCalendarEvent', () => {
  it('turns an inclusive 3-day range into an exclusive FullCalendar end', () => {
    const mapped = toCalendarEvent(apiEvent({ start: '2026-12-04', endDate: '2026-12-06' }));
    expect(mapped.start).toBe('2026-12-04');
    expect(mapped.end).toBe('2026-12-07');
    expect(mapped.allDay).toBe(true);
    expect(mapped.extendedProps.isSpan).toBe(true);
  });

  it('keeps a single-day event one day long', () => {
    const mapped = toCalendarEvent(apiEvent({ start: '2026-12-06', endDate: '2026-12-06' }));
    expect(mapped.start).toBe('2026-12-06');
    expect(mapped.end).toBe('2026-12-07');
    expect(mapped.extendedProps.isSpan).toBe(false);
  });

  it('keeps timed events on the clock instead of all-day', () => {
    const mapped = toCalendarEvent(apiEvent({ start: '2026-12-06', endDate: '2026-12-06', startTime: '19:00', allDay: false }));
    expect(mapped.allDay).toBe(false);
    expect(mapped.start).toBe('2026-12-06T19:00:00+09:00');
    expect(mapped.end).toBe('2026-12-06T23:59:00+09:00');
  });

  it('gives every topic a distinct colour', () => {
    const meetup = toCalendarEvent(apiEvent({ topics: ['meetup'] }));
    const jam = toCalendarEvent(apiEvent({ topics: ['game-jam'] }));
    expect(meetup.borderColor).not.toBe(jam.borderColor);
  });
});
