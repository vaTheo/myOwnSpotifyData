import type { UnmatchedRow } from '../../model/state';
import { nameKey } from '../../model/normalize';
import { stripMixMarkers } from '../rekordbox-match';

/**
 * Where to look for a track Spotify did not find: three places to buy it
 * (vinyl-only records live on Discogs) and two to hear it. Plain search pages —
 * no request is made until the owner taps one.
 */
export type DigSite =
  'beatport' | 'bandcamp' | 'discogs' | 'soundcloud' | 'youtube';

export interface DigLink {
  site: DigSite;
  label: string;
  href: string;
}

/** One not-found track, listed once however many times the mix played it. */
export interface DigRow {
  artist: string;
  title: string;
  /** Seconds into the mix, in play order; unknown times are left out. */
  times: number[];
  shazamUrl: string | null;
  links: DigLink[];
}

const SITES: {
  site: DigSite;
  label: string;
  base: string;
  param: string;
  extra?: Record<string, string>;
}[] = [
  {
    site: 'beatport',
    label: 'Beatport',
    base: 'https://www.beatport.com/search/tracks',
    param: 'q',
  },
  {
    site: 'bandcamp',
    label: 'Bandcamp',
    base: 'https://bandcamp.com/search',
    param: 'q',
    extra: { item_type: 't' },
  },
  {
    site: 'discogs',
    label: 'Discogs',
    base: 'https://www.discogs.com/search/',
    param: 'q',
    extra: { type: 'all' },
  },
  {
    site: 'soundcloud',
    label: 'SoundCloud',
    base: 'https://soundcloud.com/search/sounds',
    param: 'q',
  },
  {
    site: 'youtube',
    label: 'YouTube',
    base: 'https://www.youtube.com/results',
    param: 'search_query',
  },
];

/** "Artist Title" with the store-specific mix markers dropped. */
export function digQuery(artist: string, title: string): string {
  return `${artist} ${stripMixMarkers(title)}`.replace(/\s+/g, ' ').trim();
}

export function digLinks(artist: string, title: string): DigLink[] {
  const q = digQuery(artist, title);
  return SITES.map(({ site, label, base, param, extra }) => {
    const url = new URL(base);
    url.searchParams.set(param, q);
    for (const [k, v] of Object.entries(extra ?? {}))
      url.searchParams.set(k, v);
    return { site, label, href: url.href };
  });
}

/** Groups repeats on the normalised name, keeping the first spelling seen. */
export function digRows(unmatched: UnmatchedRow[]): DigRow[] {
  const byKey = new Map<string, DigRow>();
  for (const u of unmatched) {
    const key = nameKey(u.artist, u.title);
    let row = byKey.get(key);
    if (!row) {
      row = {
        artist: u.artist,
        title: u.title,
        times: [],
        shazamUrl: null,
        links: digLinks(u.artist, u.title),
      };
      byKey.set(key, row);
    }
    if (u.startSec !== null) row.times.push(u.startSec);
    row.shazamUrl ??= u.shazamUrl;
  }
  return [...byKey.values()];
}
