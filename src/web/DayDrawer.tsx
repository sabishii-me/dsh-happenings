import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ExternalLink, X } from 'lucide-react';
import type { ApiEvent } from '../domain/types';
import { fetchDay, type Filters } from './api';

interface Props {
  date: string | null;
  filters: Filters;
  onClose: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

/** Right-hand panel for a day: every event of that day, each a real link. */
export function DayDrawer({ date, filters, onClose, t }: Props) {
  const [items, setItems] = useState<ApiEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDay(date, filters)
      .then((events) => {
        if (!cancelled) setItems(events);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : t('error.load'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, filters, t]);

  return (
    <Dialog.Root open={Boolean(date)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          className="fixed right-0 top-0 z-50 flex h-screen w-[min(380px,92vw)] flex-col border-l border-slate-400/30 bg-white text-slate-900 shadow-2xl outline-none"
          aria-describedby={undefined}
        >
          <header className="flex items-baseline gap-2 border-b border-slate-400/30 px-4 py-3">
            <Dialog.Title className="text-sm font-semibold">{date ?? ''}</Dialog.Title>
            <span className="text-xs opacity-60">{loading ? t('drawer.loading') : t('drawer.count', { n: items.length })}</span>
            <Dialog.Close className="ml-auto rounded border border-slate-400/40 px-2 py-0.5 text-xs" aria-label={t('drawer.close')}>
              <X size={12} className="inline" /> {t('drawer.close')}
            </Dialog.Close>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {error ? <p className="text-xs text-red-500">{error}</p> : null}
            {!loading && !error && items.length === 0 ? <p className="text-xs opacity-60">{t('drawer.empty')}</p> : null}
            <ul className="space-y-3">
              {items.map((event) => (
                <li key={event.id} className="border-b border-slate-400/20 pb-3">
                  <p className="text-[11px] tabular-nums opacity-60">
                    {event.startTime ?? t('drawer.allDay')}
                    {event.endDate !== event.start
                      ? ` · ${event.start.slice(5).replace('-', '/')}–${event.endDate.slice(5).replace('-', '/')}`
                      : ''}
                  </p>
                  <a
                    href={event.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm underline decoration-dotted underline-offset-2 hover:text-sky-500"
                  >
                    {event.title}
                  </a>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] opacity-60">
                    {event.venue ?? event.city ?? null}
                    {event.aiPolicy ? (
                      <span className="rounded-full border border-slate-400/40 px-1.5 py-0.5">
                        {t(`ai.${event.aiPolicy.status}`)}
                      </span>
                    ) : null}
                    {event.hrefIsSource ? <span className="italic">{t('drawer.source')}</span> : null}
                    <ExternalLink size={11} aria-hidden />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
