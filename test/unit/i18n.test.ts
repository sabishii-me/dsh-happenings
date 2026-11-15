import { describe, expect, it } from 'vitest';
import { DICT, LANGS, detectLang, missingKeys, normalizeLang, translate } from '../../src/web/i18n';

describe('i18n dictionaries', () => {
  it('every locale defines the same keys with no empty values', () => {
    expect(missingKeys().every((entry) => entry.keys.length === 0)).toBe(true);
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(DICT[lang])) {
        expect(value.trim().length, `${lang}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('interpolates named variables and leaves unknown ones alone', () => {
    expect(translate('en', 'meta.count', { total: 12, judged: 3 })).toBe('12 events · 3 judged');
    expect(translate('ja', 'drawer.count', { n: 4 })).toBe('4 件');
    expect(translate('zh', 'meta.count', { total: 1 })).toContain('1');
  });

  it('falls back to Chinese for an unknown key', () => {
    expect(translate('en', 'topic.meetup')).toBe('Meetup');
    expect(translate('ja', 'does.not.exist')).toBe('does.not.exist');
  });

  it('maps browser and query languages', () => {
    expect(normalizeLang('ja-JP')).toBe('ja');
    expect(normalizeLang('en-US')).toBe('en');
    expect(normalizeLang('zh-Hans-CN')).toBe('zh');
    expect(normalizeLang('fr-FR')).toBeNull();
  });

  it('prefers ?lang= over storage over the browser', () => {
    expect(detectLang('?lang=ja', 'zh', 'en-US')).toBe('ja');
    expect(detectLang('', 'en', 'ja-JP')).toBe('en');
    expect(detectLang('', null, 'ja-JP')).toBe('ja');
    expect(detectLang('', null, null)).toBe('zh');
  });
});
