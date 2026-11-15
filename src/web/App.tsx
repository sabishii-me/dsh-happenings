import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import zhCn from '@fullcalendar/core/locales/zh-cn';
import ja from '@fullcalendar/core/locales/ja';
import enGb from '@fullcalendar/core/locales/en-gb';
import { RefreshCw } from 'lucide-react';
import type { ApiEvent } from '../domain/types';
import { toCalendarEvents, type CalendarEvent } from '../domain/calendar-map';
import { fetchEvents, fetchMeta, triggerRefresh, type Filters, type MetaInfo } from './api';
import { DayDrawer } from './DayDrawer';
import { FiltersBar } from './Filters';
import { useI18n } from './useI18n';
import { LANGS, LANG_LABEL, type Lang } from './i18n';

function fmt(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const FC_LOCALE: Record<Lang, typeof zhCn> = { zh: zhCn, ja, en: enGb };

export function App() {
  const calendarRef = useRef<FullCalendar | null>(null);
  const { lang, setLang, t } = useI18n();
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [filters, setFilters] = useState<Filters>({ topics: [], ai: null });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [drawerDate, setDrawerDate] = useState<string | null>(null);
  const [meta, setMeta] = useState<MetaInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t('app.title');
  }, [lang, t]);

  const load = useCallback(async () => {
    if (!range) return;
    try {
      const envelope = await fetchEvents(range.from, range.to, filters);
      setEvents(toCalendarEvents(envelope.items as ApiEvent[]));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('error.load'));
    }
  }, [range, filters, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetchMeta().then(setMeta).catch(() => setMeta(null));
  }, [busy]);

  const refresh = async () => {
    setBusy(true);
    try {
      await triggerRefresh();
      await load();
      setMeta(await fetchMeta());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('error.refresh'));
    } finally {
      setBusy(false);
    }
  };

  const lastRun = useMemo(() => {
    if (!meta?.sources?.length) return null;
    const stamps = meta.sources.map((source) => source.lastRunAt).filter(Boolean) as string[];
    if (stamps.length === 0) return null;
    return stamps.sort().at(-1) ?? null;
  }, [meta]);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-xl font-bold">{t('app.title')}</h1>
          <span className="text-xs text-slate-500">
            {meta ? t('meta.count', { total: meta.total, judged: meta.judged }) : t('meta.loading')}
          </span>
          <span className="text-xs text-slate-400">
            {lastRun ? t('meta.updatedAt', { time: new Date(lastRun).toLocaleString(lang) }) : t('meta.never')}
          </span>

          <span className="ml-auto flex items-center gap-1" role="group" aria-label="language">
            {LANGS.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                aria-pressed={code === lang}
                className={`rounded border px-1.5 py-0.5 text-[11px] ${
                  code === lang
                    ? 'border-slate-400 bg-slate-100 font-semibold'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                {LANG_LABEL[code]}
              </button>
            ))}
          </span>

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1 text-xs disabled:opacity-50"
          >
            <RefreshCw size={12} className={busy ? 'animate-spin' : ''} aria-hidden />
            {busy ? t('refresh.busy') : t('refresh.run')}
          </button>
        </div>
        <FiltersBar filters={filters} onChange={setFilters} t={t} />
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </header>

      <main className="rounded-xl border border-slate-200 p-2">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin]}
          initialView="dayGridMonth"
          locale={FC_LOCALE[lang]}
          firstDay={1}
          height="auto"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' }}
          buttonText={{ today: t('cal.today'), month: t('cal.month'), week: t('cal.week') }}
          dayMaxEvents={3}
          navLinks
          events={events}
          datesSet={(arg) => setRange({ from: fmt(arg.start), to: fmt(arg.end) })}
          moreLinkClick={(arg) => {
            setDrawerDate(fmt(arg.date));
            return 'prevent';
          }}
          navLinkDayClick={(date) => setDrawerDate(fmt(date))}
          eventClick={(arg) => {
            arg.jsEvent.preventDefault();
            const url = arg.event.url;
            if (url) window.open(url, '_blank', 'noopener,noreferrer');
          }}
          eventContent={(arg) => {
            const event = arg.event;
            const props = event.extendedProps as CalendarEvent['extendedProps'];
            return (
              <div className="flex w-full items-baseline gap-1 overflow-hidden px-1 py-[1px] text-[11px] leading-tight">
                {event.allDay ? null : <span className="tabular-nums opacity-70">{arg.timeText}</span>}
                <span className="truncate font-medium">{event.title}</span>
                {props.aiStatus ? (
                  <span className="ml-auto shrink-0 rounded-full border border-current px-1 text-[9px] opacity-70">
                    {t(`ai.${props.aiStatus}`)}
                  </span>
                ) : null}
              </div>
            );
          }}
        />
      </main>

      <footer className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        {meta?.sources?.map((source) => (
          <span key={source.source}>
            {source.source}: {source.status ?? t('footer.notRun')}
            {source.items != null ? ` · ${t('footer.items', { n: source.items })}` : ''}
            {source.error ? ` · ${source.error}` : ''}
          </span>
        ))}
      </footer>

      <DayDrawer date={drawerDate} filters={filters} onClose={() => setDrawerDate(null)} t={t} />
    </div>
  );
}
