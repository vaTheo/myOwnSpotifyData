import type { ArtistRef, Period } from '../db/schema';
import type { ImportCounts } from '../history/records';
import { WELL_KNOWN_MIN_SITELINKS } from '../model/reach';

export const PERIOD_LABEL: Record<Period, string> = {
  short_term: '4 weeks',
  medium_term: '6 months',
  long_term: '1 year',
};

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** Accepts an export timestamp (ISO) or a stored epoch (`importedAt`). */
export function formatDate(value: string | number): string {
  return new Date(value).toLocaleDateString([], { dateStyle: 'medium' });
}

export function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * The import summary's "Not counted" line with the zero categories dropped:
 * "Not counted: 22 under 30 s, 13 podcast". Null when everything counted, so
 * the whole line disappears rather than reading "Not counted: ".
 */
export function notCountedLine(counts: ImportCounts): string | null {
  const parts: string[] = [];
  const add = (n: number, label: string): void => {
    if (n > 0) parts.push(`${n.toLocaleString()} ${label}`);
  };
  add(counts.short, 'under 30 s');
  add(counts.podcast, 'podcast');
  add(counts.audiobook, 'audiobook');
  add(counts.unattributed, 'without a track id');
  add(counts.malformed, 'unreadable');
  return parts.length > 0 ? `Not counted: ${parts.join(', ')}` : null;
}

/**
 * A yearly Wikipedia view count, where the exact figure carries no meaning:
 * `1,352` -> '1,352'; `288,783` -> '289k'; `999,999` -> '1m';
 * `1,240,000` -> '1.2m'. The 999,500 boundary exists so the `k` branch can
 * never print `1000k`. Listeners and fans are always printed in full.
 */
export function compactCount(n: number): string {
  if (n < 10_000) return n.toLocaleString();
  if (n < 999_500) return `${Math.round(n / 1000)}k`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}m`;
}

/** One decimal, a trailing `.0` dropped: `124`, `127.5` (spec §5). */
export function formatBpm(bpm: number): string {
  return bpm.toFixed(1).replace(/\.0$/, '');
}

export function artistNames(artists: ArtistRef[]): string {
  return artists.map((a) => a.name).join(', ');
}

/** Playlist items only carry artist ids and names; the link is derived. */
export function artistUrl(id: string | null): string | null {
  return id ? `https://open.spotify.com/artist/${id}` : null;
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
  if (listeners !== null) {
    parts.push(plural(listeners, 'ListenBrainz listener'));
  }
  if (fans !== null) parts.push(plural(fans, 'Deezer fan'));
  return parts.length > 0 ? parts.join(' · ') : 'no reach data';
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
  const line = `Wikipedia · ${plural(sitelinks, 'language')}`;
  return views !== null && views > 0
    ? `${line} · ${compactCount(views)} views/yr`
    : line;
}
