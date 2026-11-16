import { format, language, months, n } from './en/common';
import { core } from './en/core';
import { crate } from './en/crate';
import { demo } from './en/demo';
import { frame } from './en/frame';
import { library } from './en/library';
import { mix } from './en/mix';
import { overview } from './en/overview';
import { settings } from './en/settings';
import { signin } from './en/signin';
import { sources } from './en/sources';
import { table } from './en/table';

/**
 * Every text the app writes, in English (spec 031, ADR-18). This file is the
 * source: its shape is the shape `fr.ts` must have, and its words are the
 * app's words, unchanged by the move (FR-003). One file per area under
 * `en/`. A text with a value is a function; a counted noun agrees inside its
 * own entry.
 */
export const en = {
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
