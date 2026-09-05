import type { RekordboxValue } from '../db/schema';
import { normalize } from '../model/normalize';
import type { RbTrack } from './rekordbox';

/** A synced Spotify track. Local files have no id and are left out. */
export interface LibraryTrack {
  id: string;
  name: string;
  artists: string[];
  durationMs: number;
}

export interface RekordboxMatch {
  trackId: string;
  value: RekordboxValue;
}

/** rekordbox TotalTime is whole seconds; Spotify durations are exact. */
const DURATION_TOLERANCE_MS = 2000;

const FEAT_GROUP = /[([]\s*(?:featuring|feat|ft)\b[^)\]]*[)\]]/gi;
const FEAT_TAIL = /\s+(?:-\s*)?(?:featuring|feat|ft)\b[^([]*/gi;
const GENERIC_GROUP =
  /[([]\s*(?:original mix|extended mix|radio edit)\s*[)\]]/gi;
const GENERIC_TAIL = /\s+-\s*(?:original mix|extended mix|radio edit)\s*$/i;
const ARTIST_SPLIT = /,|&|\sx\s|\bfeaturing\b|\bfeat\b|\bft\b/i;

/**
 * Normalised title with the noise both sides spell differently removed. A
 * remix tail stays: "Losing It (Ted Remix)" is not "Losing It".
 */
export function cleanTitle(s: string): string {
  return normalize(
    s
      .replace(FEAT_GROUP, ' ')
      .replace(FEAT_TAIL, ' ')
      .replace(GENERIC_GROUP, ' ')
      .trim()
      .replace(GENERIC_TAIL, '')
  );
}

/** The first credited artist of a joined string, unnormalised. */
export function primaryArtist(s: string): string {
  const first = s.split(ARTIST_SPLIT)[0] ?? '';
  return first.trim() || s.trim();
}

function libraryKey(track: LibraryTrack): string {
  const artist = normalize(primaryArtist(track.artists[0] ?? ''));
  return `${cleanTitle(track.name)}|${artist}`;
}

function rbKey(track: RbTrack): string {
  const artist = normalize(primaryArtist(track.artist));
  return `${cleanTitle(track.title)}|${artist}`;
}

function pick(
  track: RbTrack,
  candidates: LibraryTrack[]
): { library: LibraryTrack; matchedBy: RekordboxValue['matchedBy'] } | null {
  if (candidates.length === 1) {
    return { library: candidates[0], matchedBy: 'title-artist' };
  }
  if (candidates.length === 0 || track.seconds === null) return null;
  const ms = track.seconds * 1000;
  const close = candidates.filter(
    (c) => Math.abs(ms - c.durationMs) <= DURATION_TOLERANCE_MS
  );
  return close.length === 1
    ? { library: close[0], matchedBy: 'title-artist-duration' }
    : null;
}

export function matchRekordbox(
  tracks: RbTrack[],
  library: LibraryTrack[],
  now = 0
): { matches: RekordboxMatch[]; unmatched: number } {
  const index = new Map<string, LibraryTrack[]>();
  for (const track of library) {
    if (!track.id) continue;
    const key = libraryKey(track);
    const bucket = index.get(key);
    if (bucket) bucket.push(track);
    else index.set(key, [track]);
  }
  const matches: RekordboxMatch[] = [];
  let unmatched = 0;
  for (const track of tracks) {
    const picked = pick(track, index.get(rbKey(track)) ?? []);
    if (!picked) {
      unmatched += 1;
      continue;
    }
    matches.push({
      trackId: picked.library.id,
      value: {
        bpm: track.bpm,
        key: track.key?.key ?? null,
        major: track.key?.major ?? null,
        energy: null,
        fetchedAt: now,
        matchedBy: picked.matchedBy,
        rbTitle: track.title,
        rbArtist: track.artist,
      },
    });
  }
  return { matches, unmatched };
}
