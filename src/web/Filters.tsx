import { TOPICS, type Topic } from '../domain/types';
import { TOPIC_COLORS } from '../domain/calendar-map';
import type { Filters } from './api';

interface Props {
  filters: Filters;
  onChange: (filters: Filters) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const AI_OPTIONS: Array<{ value: string; key: string }> = [
  { value: '', key: 'filters.aiAll' },
  { value: 'allowed', key: 'filters.aiAllowed' },
  { value: 'restricted', key: 'filters.aiRestricted' },
  { value: 'forbidden', key: 'filters.aiForbidden' },
];

export function FiltersBar({ filters, onChange, t }: Props) {
  const toggleTopic = (topic: Topic) => {
    const next = filters.topics.includes(topic)
      ? filters.topics.filter((item) => item !== topic)
      : [...filters.topics, topic];
    onChange({ ...filters, topics: next });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {TOPICS.filter((topic) => topic !== 'other').map((topic) => {
        const active = filters.topics.includes(topic);
        return (
          <button
            key={topic}
            type="button"
            onClick={() => toggleTopic(topic)}
            aria-pressed={active}
            title={topic}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition ${
              active
                ? 'border-slate-400 bg-slate-100 font-semibold'
                : 'border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
          >
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: TOPIC_COLORS[topic] }} />
            {t(`topic.${topic}`)}
          </button>
        );
      })}

      <select
        aria-label={t('filters.ai')}
        value={filters.ai ?? ''}
        onChange={(event) => onChange({ ...filters, ai: event.target.value || null })}
        className="rounded border border-slate-200 bg-transparent px-2 py-0.5 text-[11px]"
      >
        {AI_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.key)}
          </option>
        ))}
      </select>

      {filters.topics.length > 0 || filters.ai ? (
        <button
          type="button"
          onClick={() => onChange({ topics: [], ai: null })}
          className="text-[11px] text-slate-500 underline"
        >
          {t('filters.clear')}
        </button>
      ) : null}
    </div>
  );
}
