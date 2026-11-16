import { intIn } from '../fmt';

/** A whole number in the French form: `1 234`. */
export const int = (n: number): string => intIn('fr', n);

/** A counted noun: `0 titre`, `1 titre`, `2 titres`. 0 and 1 are singular. */
export const count =
  (one: string, many = `${one}s`) =>
  (n: number): string =>
    `${int(n)} ${n < 2 ? one : many}`;

/** The bare word agreed with a count, no number: `titre`, `titres`. */
export const word =
  (one: string, many = `${one}s`) =>
  (n: number): string =>
    n < 2 ? one : many;
