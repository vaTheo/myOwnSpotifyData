import type { Clue, TracklistRow } from '../../db/schema';
import { digLinks } from '../../features/mix/digLinks';
import { isIdentified } from '../../features/mix/spotifySearch';
import { formatClock, plural } from '../format';

/**
 * The words of one tracklist row (spec 003 §12, rounds 003–004 ported from
 * the old `ui/Mix.tsx`). Pure, so the table, the phone item and the tests
 * read the same text. A missing number is `null`, never a zero.
 */

/** A menu link: `app` links are the Spotify app's own scheme, opened in place. */
export interface PlayLink {
  label: string;
  href: string;
  app?: true;
}

/**
 * The direct pages of a row, the ones that open on the track itself, never on
 * a search: Spotify from the Check answer, else from the library match (a
 * local file has no page), then Shazam's page while the row still reads as the
 * scan heard it. Play on Spotify is the app's own link (`spotify:track:…`) on
 * every device, opened in place (round 010). Empty when none is known; the
 * caller adds the search pages.
 */
export function playLinks(
  row: TracklistRow,
  libraryTrackId: string | null
): PlayLink[] {
  const links: PlayLink[] = [];
  let id: string | null = null;
  if (typeof row.spotify === 'object') {
    id = row.spotify.id;
  } else if (
    row.spotify === undefined &&
    libraryTrackId !== null &&
    !libraryTrackId.startsWith('spotify:')
  ) {
    id = libraryTrackId;
  }
  if (id !== null) {
    links.push({
      label: 'Play on Spotify',
      href: `spotify:track:${id}`,
      app: true,
    });
  }
  if (row.shazamUrl && row.source === 'tracklistify') {
    links.push({ label: 'Shazam', href: row.shazamUrl });
  }
  return links;
}

/**
 * The Spotify id a row's ▶ plays (round 010; on a phone since round 022):
 * the Check answer's id (a hand link too) of a named row. Null when not
 * found, not checked (a library match alone is no answer: it stays in the
 * Listen menu), for a gap or an unnamed row.
 */
export function foundSpotifyId(row: TracklistRow): string | null {
  if (!isIdentified(row) || typeof row.spotify !== 'object') return null;
  return row.spotify.id;
}

/** A row's icon link (round 010): the site's glyph, opened in a new tab. */
export interface ListenIcon {
  site: 'shazam' | 'soundcloud';
  label: string;
  href: string;
}

/**
 * The icon links beside the Listen menu and on a phone's meta line (round
 * 010): Shazam's page under `playLinks`' rule (the stored URL, while the row
 * still reads as the scan heard it), then the SoundCloud search page from
 * `digLinks` (a search, so its name says so; ADR-04). None for a gap or an
 * unnamed row.
 */
export function listenIcons(row: TracklistRow): ListenIcon[] {
  if (!isIdentified(row)) return [];
  const track = `${row.artist} – ${row.title}`;
  const icons: ListenIcon[] = [];
  if (row.shazamUrl && row.source === 'tracklistify') {
    icons.push({
      site: 'shazam',
      label: `Shazam ${track}`,
      href: row.shazamUrl,
    });
  }
  const sc = digLinks(row.artist, row.title).find(
    (l) => l.site === 'soundcloud'
  );
  if (sc) {
    icons.push({
      site: 'soundcloud',
      label: `Search SoundCloud for ${track}`,
      href: sc.href,
    });
  }
  return icons;
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
    // Round 021: never the commenter's name (the owner found it confusing).
    return 'from a comment';
  }
  if (row.origin === 'trackid') {
    const t = row.trackid;
    if (!t) return 'from TrackId.net';
    const span = `${formatClock(t.spanStart)} to ${formatClock(t.spanEnd)}`;
    const refs =
      t.references !== undefined
        ? ` · ${plural(t.references, 'reference')}`
        : '';
    return `from TrackId.net · ${span}${refs}`;
  }
  return null;
}

/**
 * Round 016: the Shazam probe's line under a TrackId.net row; null for
 * 'not_asked', a row without a check and every other row.
 */
export function checkText(row: TracklistRow): string | null {
  const c = row.shazamCheck;
  if (row.origin !== 'trackid' || !c) return null;
  if (c.outcome === 'agrees') return 'Shazam agrees';
  if (c.outcome === 'no_match') return 'Shazam: no match';
  if (c.outcome === 'differs')
    return c.artist && c.title
      ? `Shazam heard ${c.artist} - ${c.title} instead`
      : 'Shazam heard something else';
  return null;
}

/**
 * Round 004: "heard N× · best X %" when the row has clip counts, else
 * "X% match". Only while the row still reads as the scan detected it (an
 * edit flips `source` away from 'tracklistify'); never for a candidate or a
 * gap, which were not heard.
 */
export function confidenceText(row: TracklistRow): string | null {
  if (row.gap || row.origin === 'clue' || row.origin === 'trackid') return null;
  if (row.source !== 'tracklistify' || row.confidence == null) return null;
  const best = Math.round(row.confidence);
  return row.hits !== undefined
    ? `heard ${row.hits}× · best ${best} %`
    : `${best}% match`;
}

/**
 * The merged Confidence cell (round 010, Clips folded in): times heard, then
 * the best percentage, "×3 · 92%"; "92%" without clip counts. Null wherever
 * the long text is null; the long text is its tooltip and what a screen
 * reader and a phone read.
 */
export function confidenceShort(row: TracklistRow): string | null {
  if (confidenceText(row) === null || row.confidence == null) return null;
  const best = Math.round(row.confidence);
  return row.hits !== undefined ? `×${row.hits} · ${best}%` : `${best}%`;
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

/** The row's own year (`features/mix/worker.ts`), re-exported for the table. */
export { rowYear } from '../../features/mix/worker';

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

/**
 * One clue as plain text (never HTML): "mm:ss · text" for a comment (round
 * 021: never the commenter's name), "mm:ss · author · text" for a chapter or
 * description line, whose author is the uploader. The time only when known.
 */
export function clueLine(c: Clue): string {
  const at = c.atSec !== null ? `${formatClock(c.atSec)} · ` : '';
  const by = c.kind !== 'comment' && c.author ? `${c.author} · ` : '';
  return `${at}${by}${c.text}`;
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
