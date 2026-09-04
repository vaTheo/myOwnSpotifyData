import type { EntryRow, TrackRow } from '../db/schema';
import type { ApiPlaylistItem, ApiTrack } from '../spotify/types';

export interface MappedItem {
  track: TrackRow;
  addedAt: string | null;
}

export function mapPlaylistItem(
  raw: ApiPlaylistItem | null | undefined
): MappedItem | null {
  if (!raw) return null;
  const item = raw.item ?? raw.track ?? null;
  if (!item || item.type === 'episode') return null;
  const track = item as ApiTrack;
  if (typeof track.uri !== 'string' || typeof track.name !== 'string') {
    return null;
  }
  const isLocal =
    raw.is_local === true ||
    track.is_local === true ||
    track.uri.startsWith('spotify:local:');
  const id = isLocal ? null : (track.id ?? null);
  return {
    addedAt: raw.added_at ?? null,
    track: {
      key: id ?? track.uri,
      id,
      uri: track.uri,
      name: track.name,
      artists: (track.artists ?? []).map((a) => ({
        id: a.id ?? null,
        name: a.name,
      })),
      album: track.album?.name ?? '',
      durationMs: track.duration_ms ?? 0,
      isrc: track.external_ids?.isrc ?? null,
      spotifyUrl: isLocal ? null : (track.external_urls?.spotify ?? null),
      isLocal,
    },
  };
}

export function buildEntries(
  playlistId: string,
  mapped: MappedItem[]
): { tracks: TrackRow[]; entries: EntryRow[] } {
  const tracks = new Map<string, TrackRow>();
  const entries: EntryRow[] = [];
  mapped.forEach((m, position) => {
    tracks.set(m.track.key, m.track);
    entries.push({
      playlistId,
      position,
      trackKey: m.track.key,
      addedAt: m.addedAt,
    });
  });
  return { tracks: [...tracks.values()], entries };
}
