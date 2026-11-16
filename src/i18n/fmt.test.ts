import { afterEach, describe, expect, it } from 'vitest';
import { fmt, intIn } from './fmt';
import { lang } from './lang';

/** 16 Nov 2026, 09:05 local time, whatever the machine's zone. */
const AT = new Date(2026, 10, 16, 9, 5).getTime();

describe('numbers and dates in the language shown (spec 031, FR-008)', () => {
  afterEach(() => {
    lang.value = 'en';
  });

  it('writes them the British way in English', () => {
    expect(fmt.int(1234)).toBe('1,234');
    expect(fmt.date(AT)).toBe('16 Nov 2026');
    expect(fmt.time(AT)).toBe('09:05');
    expect(fmt.dateTime(AT)).toBe('16 Nov 2026, 09:05');
  });

  it('writes them the French way in French', () => {
    lang.value = 'fr';
    // French groups thousands with a narrow no-break space (U+202F).
    expect(fmt.int(1234)).toBe('1 234');
    expect(fmt.date(AT)).toBe('16 nov. 2026');
    expect(fmt.time(AT)).toBe('09:05');
    expect(fmt.dateTime(AT)).toBe('16 nov. 2026, 09:05');
  });

  it('formats for a named language whatever is shown', () => {
    lang.value = 'fr';
    expect(intIn('en', 1234)).toBe('1,234');
    expect(intIn('fr', 1234)).toBe('1 234');
  });
});
