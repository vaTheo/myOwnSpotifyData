import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialLang, lang, readSavedLang, setLang } from './lang';

describe('the language shown (spec 031)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    lang.value = 'en';
  });

  it('follows the browser on a first visit: French first gives French', () => {
    expect(initialLang(null, ['fr-FR', 'en'])).toBe('fr');
    expect(initialLang(null, ['fr'])).toBe('fr');
    expect(initialLang(null, ['FR-ca'])).toBe('fr');
  });

  it('gives English for any other first language, French second included', () => {
    expect(initialLang(null, ['en-GB', 'fr'])).toBe('en');
    expect(initialLang(null, ['de-DE'])).toBe('en');
    expect(initialLang(null, [])).toBe('en');
  });

  it('lets a saved choice win over the browser', () => {
    expect(initialLang('en', ['fr-FR'])).toBe('en');
    expect(initialLang('fr', ['en-GB'])).toBe('fr');
  });

  it('counts any other saved value as no choice', () => {
    expect(initialLang('de', ['fr-FR'])).toBe('fr');
    expect(initialLang('', ['en-GB'])).toBe('en');
  });

  it('starts in English where there is no browser', () => {
    expect(lang.value).toBe('en');
  });

  it('shows a pick at once and keeps it on the device', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    expect(readSavedLang()).toBeNull();
    setLang('fr');
    expect(lang.value).toBe('fr');
    expect(store.get('lang')).toBe('fr');
    expect(readSavedLang()).toBe('fr');
  });

  it('reads a saved value that is not a language as none', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => 'klingon',
      setItem: () => undefined,
    });
    expect(readSavedLang()).toBeNull();
  });

  it('still applies a pick when storage refuses', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readSavedLang()).toBeNull();
    setLang('fr');
    expect(lang.value).toBe('fr');
  });
});
