import { en } from './en';
import { fr } from './fr';
import { lang, type Lang } from './lang';

/**
 * The catalogue's shape, taken from the English one: a text is a string, a
 * text with values a function of them. `fr.ts` must satisfy it, so a text
 * with no French version fails the type check (spec 031, FR-017).
 */
type Shape<T> = T extends string
  ? string
  : T extends (...args: infer A) => string
    ? (...args: A) => string
    : { [K in keyof T]: Shape<T[K]> };

export type Messages = Shape<typeof en>;

const CATALOGUES: Record<Lang, Messages> = { en, fr };

/**
 * The texts of the language shown. Read it when drawing, never keep its
 * result in a module constant: reading subscribes the screen to a switch.
 */
export function msg(): Messages {
  return CATALOGUES[lang.value];
}

export { fmt } from './fmt';
export { applyDocumentLang, lang, LANGS, setLang, type Lang } from './lang';
