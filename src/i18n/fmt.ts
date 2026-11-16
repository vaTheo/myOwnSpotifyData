import { lang, LOCALE, type Lang } from './lang';

/** A whole number in one language's form: `1,234` or `1 234`. */
export function intIn(l: Lang, n: number): string {
  return n.toLocaleString(LOCALE[l]);
}

/**
 * Numbers and dates in the language shown (spec 031, FR-008): the British
 * form in English, the French form in French, whatever the browser prefers.
 */
export const fmt = {
  int(n: number): string {
    return intIn(lang.value, n);
  },
  /** `16 Nov 2026`, `16 nov. 2026`. */
  date(value: string | number): string {
    return new Date(value).toLocaleDateString(LOCALE[lang.value], {
      dateStyle: 'medium',
    });
  },
  /** `09:05`. */
  time(ms: number): string {
    return new Date(ms).toLocaleTimeString(LOCALE[lang.value], {
      hour: '2-digit',
      minute: '2-digit',
    });
  },
  /** `16 Nov 2026, 09:05`. */
  dateTime(ms: number): string {
    return new Date(ms).toLocaleString(LOCALE[lang.value], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  },
  /** `16/11/2026, 09:05`: the short stamp of a worker request. */
  shortDateTime(ms: number): string {
    return new Date(ms).toLocaleString(LOCALE[lang.value], {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  },
};
