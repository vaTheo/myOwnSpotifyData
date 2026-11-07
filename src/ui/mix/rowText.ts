import type { Clue, TracklistRow } from '../../db/schema';
import { formatClock, plural } from '../format';

/**
 * The words of one tracklist row (spec 003 §12, rounds 003–004 ported from
 * the old `ui/Mix.tsx`). Pure, so the table, the phone item and the tests
 * read the same text. A missing number is `null`, never a zero.
 */

/** Which layer produced the row, or how the owner changed it. */
export function sourceLabel(row: TracklistRow): string {
  if (row.source === 'trackid') return 'TrackId';
  if (row.source === 'description') return 'description';
  if (row.source === 'pasted') return 'pasted';
  if (row.source === 'tracklistify') return 'Tracklistify';
  return row.detected === null ? 'added' : 'edited';
}

/**
 * Where a worker row came from when not the first listen (round 003). A
 * candidate's "not heard" is a badge beside this text, so it is not repeated.
 */
export function originText(row: TracklistRow): string | null {
  if (row.origin === 'replay') {
    const pct = row.speedPercent ?? 0;
    return pct === 0
      ? 'second listen'
      : `second listen · ${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`;
  }
  if (row.origin === 'clue') {
    const kind = row.clue?.kind;
    if (kind === 'description') return 'from the description';
    if (kind === 'chapter') return 'from a chapter';
    return row.clue?.author
      ? `from a comment by ${row.clue.author}`
      : 'from a comment';
  }
  return null;
}

/**
 * Round 004: "heard N× · best X %" when the row has clip counts, else
 * "X% match". Only while the row still reads as the scan detected it (an
 * edit flips `source` away from 'tracklistify'); never for a candidate or a
 * gap, which were not heard.
 */
export function confidenceText(row: TracklistRow): string | null {
  if (row.gap || row.origin === 'clue') return null;
  if (row.source !== 'tracklistify' || row.confidence == null) return null;
  const best = Math.round(row.confidence);
  return row.hits !== undefined
    ? `heard ${row.hits}× · best ${best} %`
    : `${best}% match`;
}

/**
 * The same figures for the narrow Confidence column: "3× · 92 %", or
 * "92 %" without clip counts; the long text is its tooltip and what a
 * screen reader and a phone read.
 */
export function confidenceShort(row: TracklistRow): string | null {
  if (confidenceText(row) === null || row.confidence == null) return null;
  const best = Math.round(row.confidence);
  return row.hits !== undefined ? `${row.hits}× · ${best} %` : `${best} %`;
}

/** TrackId's "12 other mixes"; null when the source gave no count. */
export function referencesText(row: TracklistRow): string | null {
  if (row.referenceCount === null) return null;
  const n = row.referenceCount;
  return `${n.toLocaleString()} other ${n === 1 ? 'mix' : 'mixes'}`;
}

/** Where a row's year came from, in the Released cell's tooltip (round 005). */
const YEAR_FROM_TEXT = {
  shazam: 'from Shazam',
  catalogue: 'from the ISRC (Deezer or MusicBrainz)',
  spotify: 'from Spotify (Create playlist or Check on Spotify)',
} as const;

/** The row's own year, the one the year sort uses; null for a gap or undated. */
export function rowYear(row: TracklistRow): number | null {
  return !row.gap && typeof row.year === 'number' ? row.year : null;
}

/** "1993, from Shazam"; the year alone when its source is unknown. */
export function yearText(row: TracklistRow, year: number): string {
  return row.yearFrom
    ? `${year}, ${YEAR_FROM_TEXT[row.yearFrom]}`
    : String(year);
}

/** The start time; a gap row shows its span. */
export function timeText(row: TracklistRow): string | null {
  if (row.startSec === null) return null;
  return row.gap && row.endSec !== null
    ? `${formatClock(row.startSec)} – ${formatClock(row.endSec)}`
    : formatClock(row.startSec);
}

/** One clue as plain text: "mm:ss · author · text" (never HTML). */
export function clueLine(c: Clue): string {
  const at = c.atSec !== null ? `${formatClock(c.atSec)} · ` : '';
  return `${at}${c.author ? `${c.author} · ` : ''}${c.text}`;
}

/** Round 003: a tracklist without times from the description or a comment. */
export function setWideSummary(clues: readonly Clue[]): string {
  const from = clues.every((c) => c.kind === 'description')
    ? 'from the description'
    : 'from the comments';
  return `Tracklist ${from} (${plural(clues.length, 'line')}, no times)`;
}

/** The folded clues of a gap row. */
export function gapCluesSummary(n: number): string {
  return `${plural(n, 'clue')} around here`;
}
