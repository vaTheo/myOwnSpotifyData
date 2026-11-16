import { signal } from '@preact/signals';

/**
 * The language shown (spec 031, ADR-18): English or French, picked on this
 * device or, with no pick, given by the browser's first preferred language.
 */
export type Lang = 'en' | 'fr';

export const LANGS: readonly Lang[] = ['fr', 'en'];

/** Dates and numbers follow the language shown, not the browser (FR-008). */
export const LOCALE: Record<Lang, string> = { en: 'en-GB', fr: 'fr-FR' };

const LANG_KEY = 'lang';

/**
 * Whether a count takes the singular in the language shown: only 1 in
 * English, 0 and 1 in French.
 */
export function isSingular(n: number): boolean {
  return lang.value === 'fr' ? n < 2 : n === 1;
}

function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'fr';
}

/**
 * A saved choice wins; with none, French when the browser's first preferred
 * language is French, English otherwise (spec 031, US3).
 */
export function initialLang(
  saved: string | null,
  preferred: readonly string[]
): Lang {
  if (isLang(saved)) return saved;
  return preferred[0]?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/** `getItem` returns `string | null`; anything else counts as no choice. */
export function readSavedLang(): Lang | null {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    return isLang(saved) ? saved : null;
  } catch {
    // Private mode or storage blocked: the first-visit rule decides.
    return null;
  }
}

function preferredLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  if (navigator.languages?.length) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

/** Read while drawing, so a pick redraws every screen at once (FR-005). */
export const lang = signal<Lang>(
  initialLang(readSavedLang(), preferredLanguages())
);

/** What screen readers and the browser are told the page is in (FR-016). */
export function applyDocumentLang(): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang.value;
  }
}

/**
 * The user's pick: shown at once and kept on this device. Nothing else is
 * touched: no data, no job, no request (FR-011).
 */
export function setLang(value: Lang): void {
  lang.value = value;
  applyDocumentLang();
  try {
    localStorage.setItem(LANG_KEY, value);
  } catch {
    // The choice still applies to this session.
  }
}
