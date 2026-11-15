import type { ApiEvent, Topic } from './types';
import { addDays } from './dates';

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  url: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  extendedProps: {
    event: ApiEvent;
    isSpan: boolean;
    aiStatus: string | null;
    sourceOnly: boolean;
  };
}

export const TOPIC_COLORS: Record<Topic, string> = {
  'ai-game': '#7c3aed',
  'vibe-coding': '#0ea5e9',
  hackathon: '#f97316',
  'game-jam': '#16a34a',
  meetup: '#0891b2',
  workshop: '#ca8a04',
  conference: '#475569',
  showcase: '#db2777',
  contest: '#dc2626',
  other: '#64748b',
};

export function primaryTopic(event: Pick<ApiEvent, 'topics'>): Topic {
  for (const topic of event.topics) {
    if (TOPIC_COLORS[topic]) return topic;
  }
  return 'other';
}

/**
 * ApiEvent → FullCalendar event.
 *
 * FullCalendar treats an all-day `end` as EXCLUSIVE, while our `endDate` is
 * inclusive, so a 3-day event must become start=day1, end=day4. Getting this
 * wrong is what turns a multi-day run into a one-day chip, so it lives here and
 * is unit-tested.
 */
export function toCalendarEvent(event: ApiEvent): CalendarEvent {
  const color = TOPIC_COLORS[primaryTopic(event)];
  const isSpan = event.endDate !== event.start;
  const allDay = event.startTime == null;

  return {
    id: event.id,
    title: event.title,
    start: allDay ? event.start : `${event.start}T${event.startTime}:00+09:00`,
    end: allDay ? addDays(event.endDate, 1) : `${event.endDate}T23:59:00+09:00`,
    allDay,
    url: event.href,
    backgroundColor: `${color}22`,
    borderColor: color,
    textColor: 'inherit',
    extendedProps: {
      event,
      isSpan,
      aiStatus: event.aiPolicy?.status ?? null,
      sourceOnly: event.hrefIsSource,
    },
  };
}

export function toCalendarEvents(events: ApiEvent[]): CalendarEvent[] {
  return events.map(toCalendarEvent);
}
