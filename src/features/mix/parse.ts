import type { MixRowSource, TracklistRow } from '../../db/schema';

/** ≥ this many matching lines in a run before a description block is accepted. */
export const MIX_DESCRIPTION_MIN_RUN = 5;
/** A deliberate paste accepts a single matching line. */
export const MIX_PASTE_MIN_RUN = 1;

export interface ParsedTracklist {
  rows: TracklistRow[];
  /** A "full tracklist at <url>" link found instead of a listing, or null. */
  linkOut: string | null;
}

/** A clock: 2 or 3 `:`/`.`-separated groups, optional fractional seconds. */
const CLOCK = String.raw`\d{1,3}[:.]\d{1,2}(?:[:.]\d{1,2})?(?:\.\d+)?`;
const PARSE_CLOCK = /^(\d{1,3})[:.](\d{1,2})(?:([:.])(\d{1,2}))?(?:\.\d+)?$/;

/**
 * "H:MM:SS" / "M:SS" / "M.SS", one or two H: groups, '.' or ':' as separator,
 * fractional trailing seconds tolerated; seconds from zero, or null. A bare
 * integer such as "42" has no separator and is null (so MixesDB's `[42]`
 * minutes shape never travels the clock path).
 */
export function parseClock(s: string): number | null {
  const m = PARSE_CLOCK.exec(s.trim());
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (m[3] !== undefined && m[4] !== undefined) {
    return a * 3600 + b * 60 + Number(m[4]);
  }
  return a * 60 + b;
}

// Prefixes, tried in this order. Clock shapes (4, 5) win over index shapes
// (1, 3, 6) because '.' is both a time and an index separator.
const PREFIX_BRACKET_CLOCK = new RegExp(
  `^[\\[(]\\s*(${CLOCK})\\s*[\\])]\\s*:?\\s*`
); // shape 4
const PREFIX_BARE_CLOCK = new RegExp(`^(${CLOCK})\\s+`); // shape 5
const PREFIX_INDEX = /^\d{1,3}[.)]\s+/; // shape 1
const PREFIX_SIDE = /^[a-dA-D]\d{1,2}[.)]\s+/; // shape 3
const PREFIX_BRACKET_MIN = /^\[(\d{1,3})\]\s*/; // shape 6 (minutes)

const DASH_SPLIT = /^(.*?)\s+[-–—]\s+(.*)$/;
const TRAILING_LABEL = /\s*\[([^\]]+)\]\s*$/;

const TRACKLIST_WORD = /track\s?list/i;
const URL_TOKEN = /https?:\/\/\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/i;

/** Strip at most one leading prefix; return the remainder and any startSec. */
function stripPrefix(line: string): { rest: string; startSec: number | null } {
  let m = PREFIX_BRACKET_CLOCK.exec(line);
  if (m) return { rest: line.slice(m[0].length), startSec: parseClock(m[1]) };
  m = PREFIX_BARE_CLOCK.exec(line);
  if (m) return { rest: line.slice(m[0].length), startSec: parseClock(m[1]) };
  m = PREFIX_INDEX.exec(line);
  if (m) return { rest: line.slice(m[0].length), startSec: null };
  m = PREFIX_SIDE.exec(line);
  if (m) return { rest: line.slice(m[0].length), startSec: null };
  m = PREFIX_BRACKET_MIN.exec(line);
  if (m) return { rest: line.slice(m[0].length), startSec: Number(m[1]) * 60 };
  return { rest: line, startSec: null };
}

/** Parse one non-blank line to a row, or null when it is not a track line. */
function parseTrackLine(
  line: string,
  source: MixRowSource
): TracklistRow | null {
  const { rest, startSec } = stripPrefix(line);
  const split = DASH_SPLIT.exec(rest);
  if (!split) return null;
  const artist = split[1].trim();
  let title = split[2].trim();
  let label: string | null = null;
  const labelMatch = TRAILING_LABEL.exec(title);
  if (labelMatch) {
    label = labelMatch[1].trim();
    title = title.slice(0, labelMatch.index).trim();
  }
  if (artist === '' || title === '') return null;
  return {
    startSec: startSec ?? null,
    endSec: null,
    artist,
    title,
    label,
    source,
    gap: false,
    detected: { artist, title },
    referenceCount: null,
  };
}

/**
 * A run is a maximal sequence of matching lines in which blank lines are
 * transparent (skipped, they neither match nor break) and a non-blank
 * non-matching line breaks the run. Rows come from every run of length
 * `≥ minRun`. `parseLines` also scans, independently of the run guard, for a
 * "full tracklist at <url>" link and returns it as `linkOut`.
 *
 * `source` is a defaulted internal extension of the spec's quoted two-arg
 * signature: only `parseDescription` / `parsePasted` call `parseLines`, so no
 * task boundary sees the third argument.
 */
export function parseLines(
  text: string,
  minRun: number,
  source: MixRowSource = 'description'
): ParsedTracklist {
  const lines = text.split(/\r?\n/);
  const rows: TracklistRow[] = [];
  let run: TracklistRow[] = [];
  const flush = () => {
    if (run.length >= minRun) rows.push(...run);
    run = [];
  };
  let linkOut: string | null = null;
  for (const raw of lines) {
    if (linkOut === null && TRACKLIST_WORD.test(raw)) {
      const url = URL_TOKEN.exec(raw);
      if (url) linkOut = url[0];
    }
    const line = raw.trim();
    if (line === '') continue; // blank: transparent
    const row = parseTrackLine(line, source);
    if (row) run.push(row);
    else flush(); // non-blank, non-matching: breaks the run
  }
  flush();
  return { rows, linkOut };
}

const ENTITIES: Array<[RegExp, string]> = [
  [/&amp;/gi, '&'],
  [/&lt;/gi, '<'],
  [/&gt;/gi, '>'],
  [/&quot;/gi, '"'],
  [/&#0*39;/g, "'"],
  [/&apos;/gi, "'"],
  // Decodes to U+00A0 itself (not an ASCII space) — regex `\s` matches it
  // too, so e.g. `1.&nbsp;Artist - Title` still parses under the
  // index-prefix shape instead of garbling the artist (M8).
  [/&nbsp;/gi, '\u00A0'],
];

function htmlToLines(raw: string): string {
  const withBreaks = raw.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n');
  let text = withBreaks.replace(/<[^>]+>/g, '');
  for (const [re, to] of ENTITIES) text = text.replace(re, to);
  return text;
}

/** oEmbed description: unescape entities, strip tags, then the ≥5 run guard. */
export function parseDescription(rawDescription: string): ParsedTracklist {
  return parseLines(htmlToLines(rawDescription), MIX_DESCRIPTION_MIN_RUN);
}

/** Pasted text: the owner deliberately pasted a list, so a single line counts. */
export function parsePasted(text: string): ParsedTracklist {
  return parseLines(text, MIX_PASTE_MIN_RUN, 'pasted');
}
