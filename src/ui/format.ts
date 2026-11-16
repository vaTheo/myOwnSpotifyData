import type { ArtistRef, Period } from '../db/schema';
import type { ImportSummary } from '../history/importer';
import type { ImportCounts } from '../history/records';
import { fmt, msg } from '../i18n';
import { WELL_KNOWN_MIN_SITELINKS } from '../model/reach';

/**
 * Spotify's three periods. Read when drawing: each label is the text of the
 * language shown (spec 031).
 */
export const PERIOD_LABEL: Record<Period, string> = {
  get short_term() {
    return msg().format.period.short_term;
  },
  get medium_term() {
    return msg().format.period.medium_term;
  },
  get long_term() {
    return msg().format.period.long_term;
  },
};

/** The Top screen's wording: Spotify's long term has no fixed length. */
export const TOP_PERIOD_LABEL: Record<Period, string> = {
  get short_term() {
    return msg().format.period.short_term;
  },
  get medium_term() {
    return msg().format.period.medium_term;
  },
  get long_term() {
    return msg().format.topLongTerm;
  },
};

export function formatTime(ms: number): string {
  return fmt.time(ms);
}

export function formatDateTime(ms: number): string {
  return fmt.dateTime(ms);
}

/** Accepts an export timestamp (ISO) or a stored epoch (`importedAt`). */
export function formatDate(value: string | number): string {
  return fmt.date(value);
}

/** Listening time: `45 min`, `2 h 6 min`, `1,234 h` (rounded to minutes). */
export function formatListening(ms: number): string {
  const minutes = Math.round(Math.max(0, ms) / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const text = msg().format;
  if (h === 0) return text.minutes(m);
  return m === 0 ? text.hours(h) : text.hoursMinutes(h, m);
}

/**
 * English only, kept for the callers not yet moved to the catalogue's
 * counted nouns (`msg().n.track(count)`); it goes with the last of them.
 */
export function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * The import summary's "Not counted" line with the zero categories dropped:
 * "Not counted: 22 under 30 s, 13 podcast". Null when everything counted, so
 * the whole line disappears rather than reading "Not counted: ".
 */
export function notCountedLine(counts: ImportCounts): string | null {
  const text = msg().format.notCounted;
  const parts: string[] = [];
  const add = (n: number, label: (n: number) => string): void => {
    if (n > 0) parts.push(label(n));
  };
  add(counts.short, text.short);
  add(counts.podcast, text.podcast);
  add(counts.audiobook, text.audiobook);
  add(counts.unattributed, text.unattributed);
  add(counts.malformed, text.malformed);
  return parts.length > 0 ? text.line(parts.join(', ')) : null;
}

/**
 * A yearly Wikipedia view count, where the exact figure carries no meaning:
 * `1,352` -> '1,352'; `288,783` -> '289k'; `999,999` -> '1m';
 * `1,240,000` -> '1.2m'. The 999,500 boundary exists so the `k` branch can
 * never print `1000k`. Listeners and fans are always printed in full.
 */
export function compactCount(n: number): string {
  if (n < 10_000) return fmt.int(n);
  if (n < 999_500) return msg().format.thousands(Math.round(n / 1000));
  return msg().format.millions(Number((n / 1e6).toFixed(1)));
}

/** One decimal, a trailing `.0` dropped: `124`, `127.5` (spec §5). */
export function formatBpm(bpm: number): string {
  return bpm.toFixed(1).replace(/\.0$/, '');
}

export function artistNames(artists: ArtistRef[]): string {
  return artists.map((a) => a.name).join(', ');
}

/**
 * Playlist items only carry artist ids and names; the link is derived. It is
 * the app's own `spotify:artist:<id>` (round 017 follow-up), opened in place
 * like the track play button.
 */
export function artistUrl(id: string | null): string | null {
  return id ? `spotify:artist:${id}` : null;
}

/**
 * Spec §5.3's reach line: `5,896 ListenBrainz listeners · 202,216 Deezer
 * fans`, carrying only the parts that are known and the literal
 * `no reach data` when neither is. A missing number is never printed as a
 * zero, and the two are never summed: they count different audiences.
 */
export function reachLine(
  listeners: number | null,
  fans: number | null
): string {
  const parts: string[] = [];
  const text = msg().format;
  if (listeners !== null) parts.push(text.listeners(listeners));
  if (fans !== null) parts.push(text.fans(fans));
  return parts.length > 0 ? parts.join(' · ') : text.noReach;
}

/**
 * Spec §5.3's public-profile line: `Wikipedia · 19 languages · 289k
 * views/yr`. The language count is Wikidata's sitelink count, which is a
 * floor rather than an exact total, so the line claims no more than
 * "Wikipedia". The views part is dropped when there is no view count or it is
 * 0, leaving `Wikipedia · 1 language`. Null when the artist has no article at
 * all, which is the same threshold `isWellKnown` applies.
 */
export function profileLine(
  sitelinks: number | null,
  views: number | null
): string | null {
  if (sitelinks === null || sitelinks < WELL_KNOWN_MIN_SITELINKS) return null;
  const line = msg().format.wikipedia(sitelinks);
  return views !== null && views > 0
    ? `${line} · ${msg().format.viewsPerYear(compactCount(views))}`
    : line;
}

/**
 * Spec §6's mix-timestamp helper: `44 -> '0:44'`, `704 -> '11:44'`,
 * `11437 -> '3:10:37'`. Under an hour it is `m:ss`; at or above it is
 * `h:mm:ss` with both tail groups zero-padded. A negative or fractional input
 * is floored to whole seconds from zero, so a stray value never prints a sign
 * or a decimal.
 */
export function formatClock(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  const seconds = whole % 60;
  const minutes = Math.floor(whole / 60) % 60;
  const hours = Math.floor(whole / 3600);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/** '2026-08' -> 'Aug 2026'. */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  return `${msg().months[Number(month) - 1]} ${year}`;
}

/**
 * The Listening history line of Settings, word for word, which the
 * Overview's Listening card repeats (spec 003, SC-009).
 */
export function historyLine(
  summary: ImportSummary,
  zoneAtImport?: string
): string {
  const text = msg().format.history;
  const parts = [
    text.imported(
      formatDate(summary.importedAt),
      msg().n.play(summary.plays),
      msg().n.track(summary.tracks)
    ),
  ];
  if (summary.range) {
    parts.push(
      text.range(
        formatDate(summary.range.first),
        formatDate(summary.range.last)
      )
    );
  }
  if (zoneAtImport) parts.push(text.zone(zoneAtImport));
  return parts.join(' ');
}

/**
 * Top's caption (spec 030, FR-015): the ranking is Spotify's own, which is
 * why it differs from the Crate's. Plays are named only where the table
 * shows them, so the line never promises a figure that is not on screen.
 */
export function topCaption(
  kind: 'tracks' | 'artists',
  comparing: boolean,
  hasPlays: boolean
): string {
  const text = msg().format.top;
  if (comparing) return text.comparing;
  return kind === 'tracks' && hasPlays
    ? `${text.ranking} ${text.plays}`
    : text.ranking;
}
