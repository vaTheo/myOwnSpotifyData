import type { PlayRow, TrackRow } from '../db/schema';
import { playsFor, type Model } from './aggregate';

/** The play counts the Rarely played view can ask for. */
export const RARE_COUNTS = [0, 1, 2, 3] as const;
export type RareCount = (typeof RARE_COUNTS)[number];

export interface RareItem {
  /** The history row, or one built in memory for a song the history never
   *  mentions (never stored): the Crate's table and sheet work on a play row. */
  row: PlayRow;
  track: TrackRow;
  /** 0..3, from `playsFor` (no history row or name match is 0). */
  plays: RareCount;
  /** Every playlist holding the song, in the model's playlist order. */
  playlistIds: string[];
}

/**
 * The songs of the owner's playlists played 0 to 3 times, once per song.
 * Starts from the playlist entries, not from the history rows: a song never
 * played has no row. `playlistId` limits the list to one playlist; each item
 * still names all of its playlists. Fewest plays first, then playlist order.
 * A local file is listed only when the history gave it a count.
 */
export function rarelyPlayed(
  model: Model,
  counts: ReadonlySet<number>,
  playlistId: string | null
): RareItem[] {
  const items = new Map<string, RareItem>();
  for (const playlist of model.playlists) {
    for (const entry of model.entriesByPlaylist.get(playlist.id) ?? []) {
      const track = model.tracksByKey.get(entry.trackKey);
      if (!track) continue;
      const known = items.get(track.key);
      if (known) {
        if (!known.playlistIds.includes(playlist.id)) {
          known.playlistIds.push(playlist.id);
        }
        continue;
      }
      const info = playsFor(model, track);
      if (!info && track.isLocal) continue;
      const plays = info?.plays ?? 0;
      if (!counts.has(plays)) continue;
      items.set(track.key, {
        row: model.playsById.get(track.key) ?? built(track, plays),
        track,
        plays: plays as RareCount,
        playlistIds: [playlist.id],
      });
    }
  }
  const all = [...items.values()];
  const wanted =
    playlistId === null
      ? all
      : all.filter((item) => item.playlistIds.includes(playlistId));
  return wanted.sort((a, b) => a.plays - b.plays);
}

function built(track: TrackRow, plays: number): PlayRow {
  return {
    trackId: track.key,
    plays,
    msPlayed: 0,
    firstTs: '',
    lastTs: '',
    trackName: track.name,
    artistName: track.artists[0]?.name ?? null,
  };
}
