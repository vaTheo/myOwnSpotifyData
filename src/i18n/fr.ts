import { format, language, months, n } from './fr/common';
import { core } from './fr/core';
import { crate } from './fr/crate';
import { demo } from './fr/demo';
import { frame } from './fr/frame';
import { library } from './fr/library';
import { mix } from './fr/mix';
import { overview } from './fr/overview';
import { settings } from './fr/settings';
import { signin } from './fr/signin';
import { sources } from './fr/sources';
import { table } from './fr/table';
import type { Messages } from './index';

/**
 * Every text the app writes, in French (spec 031, ADR-18). Same shape as
 * `en.ts`, one file per area under `fr/`; the names are the ones of the
 * round's glossary. French agrees 0 and 1 in the singular, and keeps a
 * no-break space (written `\u00A0`) before `:`, `?`, `!` and `;`.
 */
export const fr: Messages = {
  n,
  months,
  format,
  language,
  core,
  crate,
  demo,
  frame,
  library,
  mix,
  overview,
  settings,
  signin,
  sources,
  table,
};
