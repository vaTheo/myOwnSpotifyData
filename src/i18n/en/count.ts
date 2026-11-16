import { intIn } from '../fmt';

/** A whole number in the English form: `1,234`. */
export const int = (n: number): string => intIn('en', n);

/** A counted noun: `0 tracks`, `1 track`, `1,234 tracks`. Only 1 is singular. */
export const count =
  (one: string, many = `${one}s`) =>
  (n: number): string =>
    `${int(n)} ${n === 1 ? one : many}`;

/** The bare word agreed with a count, no number: `track`, `tracks`. */
export const word =
  (one: string, many = `${one}s`) =>
  (n: number): string =>
    n === 1 ? one : many;
