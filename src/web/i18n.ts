export const LANGS = ['zh', 'en', 'ja'] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_LABEL: Record<Lang, string> = { zh: '中文', en: 'EN', ja: '日本語' };

type Dict = Record<string, string>;

const zh: Dict = {
  'app.title': 'AI Game / Vibe Coding 活动',
  'meta.loading': '加载中…',
  'meta.count': '{total} 条 · 已判断 {judged} 条',
  'meta.updatedAt': '数据更新：{time}',
  'meta.never': '尚未运行采集',
  'refresh.run': '立即刷新数据',
  'refresh.busy': '刷新中…',
  'error.load': '加载失败',
  'error.refresh': '刷新失败',
  'filters.ai': 'AI 政策过滤',
  'filters.aiAll': 'AI：全部',
  'filters.aiAllowed': '只看 AI 可',
  'filters.aiRestricted': '只看 AI 受限',
  'filters.aiForbidden': '只看 AI 禁止',
  'filters.clear': '清除过滤',
  'cal.today': '今天',
  'cal.month': '月',
  'cal.week': '周',
  'drawer.close': '关闭',
  'drawer.loading': '加载中…',
  'drawer.count': '{n} 件',
  'drawer.empty': '这天没有活动',
  'drawer.allDay': '全天',
  'drawer.source': '来源',
  'ai.allowed': 'AI 可',
  'ai.restricted': 'AI 受限',
  'ai.forbidden': 'AI 禁止',
  'ai.unknown': 'AI 未明',
  'footer.notRun': '未运行',
  'footer.items': '{n} 条',
  'topic.ai-game': 'AI 游戏',
  'topic.vibe-coding': 'Vibe Coding',
  'topic.hackathon': '黑客松',
  'topic.game-jam': 'Game Jam',
  'topic.meetup': '交流会',
  'topic.workshop': '工作坊',
  'topic.conference': '大会',
  'topic.showcase': '出展',
  'topic.contest': '比赛',
  'topic.other': '其他',
};

const en: Dict = {
  'app.title': 'AI game & vibe-coding events',
  'meta.loading': 'Loading…',
  'meta.count': '{total} events · {judged} judged',
  'meta.updatedAt': 'Updated {time}',
  'meta.never': 'No collection run yet',
  'refresh.run': 'Refresh now',
  'refresh.busy': 'Refreshing…',
  'error.load': 'Failed to load',
  'error.refresh': 'Refresh failed',
  'filters.ai': 'Filter by AI policy',
  'filters.aiAll': 'AI: any',
  'filters.aiAllowed': 'AI allowed only',
  'filters.aiRestricted': 'AI restricted only',
  'filters.aiForbidden': 'AI forbidden only',
  'filters.clear': 'Clear filters',
  'cal.today': 'Today',
  'cal.month': 'Month',
  'cal.week': 'Week',
  'drawer.close': 'Close',
  'drawer.loading': 'Loading…',
  'drawer.count': '{n} events',
  'drawer.empty': 'Nothing on this day',
  'drawer.allDay': 'All day',
  'drawer.source': 'source',
  'ai.allowed': 'AI ok',
  'ai.restricted': 'AI restricted',
  'ai.forbidden': 'AI banned',
  'ai.unknown': 'AI unknown',
  'footer.notRun': 'not run',
  'footer.items': '{n} items',
  'topic.ai-game': 'AI game',
  'topic.vibe-coding': 'Vibe coding',
  'topic.hackathon': 'Hackathon',
  'topic.game-jam': 'Game jam',
  'topic.meetup': 'Meetup',
  'topic.workshop': 'Workshop',
  'topic.conference': 'Conference',
  'topic.showcase': 'Showcase',
  'topic.contest': 'Contest',
  'topic.other': 'Other',
};

const ja: Dict = {
  'app.title': 'AIゲーム / Vibe Coding イベント',
  'meta.loading': '読み込み中…',
  'meta.count': '{total} 件 · 判定済み {judged} 件',
  'meta.updatedAt': '更新：{time}',
  'meta.never': '収集はまだ実行されていません',
  'refresh.run': '今すぐ更新',
  'refresh.busy': '更新中…',
  'error.load': '読み込みに失敗しました',
  'error.refresh': '更新に失敗しました',
  'filters.ai': 'AIポリシーで絞り込む',
  'filters.aiAll': 'AI：すべて',
  'filters.aiAllowed': 'AI可のみ',
  'filters.aiRestricted': 'AI制限のみ',
  'filters.aiForbidden': 'AI禁止のみ',
  'filters.clear': '絞り込みを解除',
  'cal.today': '今日',
  'cal.month': '月',
  'cal.week': '週',
  'drawer.close': '閉じる',
  'drawer.loading': '読み込み中…',
  'drawer.count': '{n} 件',
  'drawer.empty': 'この日のイベントはありません',
  'drawer.allDay': '終日',
  'drawer.source': '出典',
  'ai.allowed': 'AI可',
  'ai.restricted': 'AI制限',
  'ai.forbidden': 'AI禁止',
  'ai.unknown': 'AI不明',
  'footer.notRun': '未実行',
  'footer.items': '{n} 件',
  'topic.ai-game': 'AIゲーム',
  'topic.vibe-coding': 'Vibe Coding',
  'topic.hackathon': 'ハッカソン',
  'topic.game-jam': 'ゲームジャム',
  'topic.meetup': '交流会',
  'topic.workshop': 'ワークショップ',
  'topic.conference': 'カンファレンス',
  'topic.showcase': '出展',
  'topic.contest': 'コンテスト',
  'topic.other': 'その他',
};

export const DICT: Record<Lang, Dict> = { zh, en, ja };

export function normalizeLang(value: string | null | undefined): Lang | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower.startsWith('ja')) return 'ja';
  if (lower.startsWith('en')) return 'en';
  if (lower.startsWith('zh')) return 'zh';
  return null;
}

export function detectLang(
  search: string | null | undefined,
  stored: string | null | undefined,
  navigatorLang: string | null | undefined,
): Lang {
  if (search) {
    const fromQuery = normalizeLang(new URLSearchParams(search).get('lang'));
    if (fromQuery) return fromQuery;
  }
  const fromStore = normalizeLang(stored);
  if (fromStore) return fromStore;
  return normalizeLang(navigatorLang) ?? 'zh';
}

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const value = DICT[lang][key] ?? DICT.zh[key] ?? key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function missingKeys(): Array<{ lang: Lang; keys: string[] }> {
  const base = Object.keys(DICT.zh).sort();
  return LANGS.filter((lang) => lang !== 'zh').map((lang) => ({
    lang,
    keys: base.filter((key) => !(key in DICT[lang])),
  }));
}
