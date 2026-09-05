import type { ArtistRef, Period } from '../db/schema';

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
