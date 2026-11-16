import type { Clue, TracklistRow } from '../../db/schema';
import { digLinks } from '../../features/mix/digLinks';
import { evidenceLevel, type EvidenceLevel } from '../../features/mix/evidence';
import { isIdentified } from '../../features/mix/spotifySearch';
import { msg } from '../../i18n';
import { formatClock } from '../format';

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
      label: msg().mix.row.playOnSpotify,
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
      label: msg().mix.row.shazam(track),
      href: row.shazamUrl,
    });
  }
  const sc = digLinks(row.artist, row.title).find(
    (l) => l.site === 'soundcloud'
  );
  if (sc) {
    icons.push({
      site: 'soundcloud',
      label: msg().mix.row.searchSoundcloud(track),
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
  const m = msg().mix.row;
  if (row.origin === 'replay') {
    // Spec 029: the Evidence cell says the speed the track plays at.
    if (row.mixSpeed !== undefined) return m.secondListen;
    const pct = row.speedPercent ?? 0;
    return pct === 0
      ? m.secondListen
      : m.secondListenSpeed(`${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`);
  }
  if (row.origin === 'clue') {
    const kind = row.clue?.kind;
    if (kind === 'description') return m.fromDescription;
    if (kind === 'chapter') return m.fromChapter;
    // Round 021: never the commenter's name (the owner found it confusing).
    return m.fromComment;
  }
  if (row.origin === 'trackid') {
    const t = row.trackid;
    if (!t) return m.fromTrackid;
    const start = formatClock(t.spanStart);
    const end = formatClock(t.spanEnd);
    return t.references !== undefined
      ? m.fromTrackidRefs(start, end, t.references)
      : m.fromTrackidSpan(start, end);
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
  const m = msg().mix.row;
  if (c.outcome === 'agrees') return m.shazamAgrees;
  if (c.outcome === 'no_match') return m.shazamNoMatch;
  if (c.outcome === 'differs')
    return c.artist && c.title
      ? m.shazamInstead(c.artist, c.title)
      : m.shazamElse;
  return null;
}

/**
 * Round 004: "heard N× · best X %" when the row has clip counts, else
 * "X% match". Only while the row still reads as the scan detected it (an
 * edit flips `source` away from 'tracklistify'); never for a candidate or a
 * gap, which were not heard. Spec 029: past those guards, a row with a
 * known evidence level reads its level's sentence instead.
 */
export function confidenceText(row: TracklistRow): string | null {
  if (row.gap || row.origin === 'clue' || row.origin === 'trackid') return null;
  if (row.source !== 'tracklistify' || row.confidence == null) return null;
  const level = evidenceLevel(row);
  if (level !== null) return levelLong(row, level);
  const best = Math.round(row.confidence);
  return row.hits !== undefined
    ? msg().mix.row.heardBest(row.hits, best)
    : msg().mix.row.match(best);
}

/**
 * The Evidence cell (spec 029; round 010's Confidence cell, Clips folded
 * in). A row with a known level reads its level, "Solid ×11 · −5.8 %"; an
 * older row reads times heard then the best percentage, "×3 · 92%", or
 * "92%" without clip counts. Null wherever the long text is null; the long
 * text is its tooltip and what a screen reader and a phone read.
 */
export function confidenceShort(row: TracklistRow): string | null {
  if (confidenceText(row) === null || row.confidence == null) return null;
  const level = evidenceLevel(row);
  if (level !== null) return levelShort(row, level);
  const best = Math.round(row.confidence);
  return row.hits !== undefined ? `×${row.hits} · ${best}%` : `${best}%`;
}

/** Spec 029: under 0.05 % either way the track plays at its own speed. */
const isOriginalSpeed = (pct: number): boolean => Math.abs(pct) < 0.05;

/** Spec 029: "−5.8 %", "+3.4 %", "0 %" (the minus sign is U+2212). */
export function speedShort(pct: number): string {
  if (isOriginalSpeed(pct)) return '0 %';
  return `${pct > 0 ? '+' : '−'}${msg().mix.row.decimal(Math.abs(pct))} %`;
}

/** Spec 029: "played 5.8 % slower", "played 3.4 % faster", "played at original speed". */
export function speedText(pct: number): string {
  const m = msg().mix.row;
  if (isOriginalSpeed(pct)) return m.originalSpeed;
  const x = m.decimal(Math.abs(pct));
  return pct > 0 ? m.faster(x) : m.slower(x);
}

/** Spec 029: the level's short words, the clip count, the mix speed. */
function levelShort(row: TracklistRow, level: EvidenceLevel): string {
  const count =
    (level === 'solid' || level === 'out_of_step') && row.hits !== undefined
      ? ` ×${row.hits}`
      : '';
  const l = msg().mix.row.level;
  const words = {
    solid: l.solid,
    once: l.once,
    out_of_step: l.outOfStep,
    candidates: l.candidates,
  }[level];
  const speed =
    row.mixSpeed !== undefined ? ` · ${speedShort(row.mixSpeed)}` : '';
  return `${words}${count}${speed}`;
}

/** Spec 029: the level's sentence, then how fast the track plays. */
function levelLong(row: TracklistRow, level: EvidenceLevel): string {
  const m = msg().mix.row;
  const hits = row.hits;
  let words: string;
  switch (level) {
    case 'solid':
      words = hits !== undefined ? m.solidHeard(hits) : m.solidLong;
      break;
    case 'once':
      words = m.level.once;
      break;
    case 'out_of_step':
      words = hits !== undefined ? m.outOfStepHeard(hits) : m.outOfStepLong;
      break;
    case 'candidates':
      words =
        row.candidates !== undefined
          ? m.candidatesLong(row.candidates)
          : m.level.candidates;
      break;
  }
  const speed =
    row.mixSpeed !== undefined ? ` · ${speedText(row.mixSpeed)}` : '';
  return `${words}${speed}`;
}

/** TrackId's "12 other mixes"; null when the source gave no count. */
export function referencesText(row: TracklistRow): string | null {
  if (row.referenceCount === null) return null;
  return msg().mix.row.otherMixes(row.referenceCount);
}

/** The row's own year (`features/mix/worker.ts`), re-exported for the table. */
export { rowYear } from '../../features/mix/worker';

/** "1993, from Shazam"; the year alone when its source is unknown. */
export function yearText(row: TracklistRow, year: number): string {
  // Where a row's year came from, in the Released cell's tooltip (round 005).
  const m = msg().mix.row;
  return row.yearFrom ? m.year(year, m.yearFrom[row.yearFrom]) : String(year);
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
  const m = msg().mix.row;
  return clues.every((c) => c.kind === 'description')
    ? m.wideDescription(clues.length)
    : m.wideComments(clues.length);
}

/** The folded clues of a gap row. */
export function gapCluesSummary(n: number): string {
  return msg().mix.row.gapClues(n);
}
