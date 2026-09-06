import type { TracklistRow } from '../../db/schema';
import { cleanTitle, primaryArtist } from '../rekordbox-match';
import type { Model } from '../../model/aggregate';
import { normalize } from '../../model/normalize';

export interface MixMatch {
  trackId: string;
  playlistCount: number;
}

/** The join key both a mix row and a library track are reduced to. */
function titleArtistKey(title: string, artist: string): string {
  return `${cleanTitle(title)}|${normalize(primaryArtist(artist))}`;
}

/** `ID` / `?` / `unknown` are legitimate values, but they link and match nothing. */
function isInertToken(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t === 'id' || t === '?' || t === 'unknown';
}

let indexedModel: Model | null = null;
let indexedResult = new Map<string, string[]>();

/**
 * `titleArtistKey` -> the Spotify ids that share it. Locals and id-less tracks
 * are skipped. Memoised on `Model` identity, one entry, as `rankUnderTheRadar`
 * is: the model changes only when `loadFromDb` rebuilds it.
 */
export function libraryTitleIndex(model: Model): Map<string, string[]> {
  if (indexedModel === model) return indexedResult;
  const index = new Map<string, string[]>();
  for (const track of model.tracksByKey.values()) {
    if (track.isLocal || track.id === null) continue;
    const key = titleArtistKey(track.name, track.artists[0]?.name ?? '');
    const bucket = index.get(key);
    if (bucket) bucket.push(track.id);
    else index.set(key, [track.id]);
  }
  indexedModel = model;
  indexedResult = index;
  return index;
}

/**
 * A match only when the row's key hits exactly one library id — an ambiguous
 * key is no match, the safe direction. A gap row or an `ID`/`?`/`unknown` row
 * returns null with no lookup. `playlistCount` is how many owned playlists hold
 * the matched track.
 */
export function matchMixRow(
  model: Model,
  index: Map<string, string[]>,
  row: TracklistRow
): MixMatch | null {
  if (row.gap || isInertToken(row.artist) || isInertToken(row.title)) {
    return null;
  }
  const ids = index.get(titleArtistKey(row.title, row.artist));
  if (!ids || ids.length !== 1) return null;
  const trackId = ids[0];
  return {
    trackId,
    playlistCount: model.playlistsOfTrack.get(trackId)?.size ?? 0,
  };
}
