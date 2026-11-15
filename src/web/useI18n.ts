import { useCallback, useMemo, useState } from 'react';
import { detectLang, translate, type Lang } from './i18n';

const STORAGE_KEY = 'happenings.lang';

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(lang: Lang): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // private mode: URL param still works
  }
}

function syncUrl(lang: Lang): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('lang', lang);
    window.history.replaceState(null, '', url);
  } catch {
    // ignore
  }
}

/** Locale lives in the URL (`?lang=`), then localStorage, then the browser. */
export function useI18n(): { lang: Lang; setLang: (lang: Lang) => void; t: (key: string, vars?: Record<string, string | number>) => string } {
  const [lang, setLangState] = useState<Lang>(() =>
    detectLang(window.location.search, readStored(), navigator.language),
  );

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    writeStored(next);
    syncUrl(next);
  }, []);

  const t = useMemo(() => (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);

  return { lang, setLang, t };
}
