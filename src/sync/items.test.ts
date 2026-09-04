import { describe, expect, it } from 'vitest';
import type { ApiPlaylistItem } from '../spotify/types';
import { buildEntries, mapPlaylistItem } from './items';

const track: ApiPlaylistItem = {
  added_at: '2024-01-01T00:00:00Z',
  is_local: false,
  item: {
    type: 'track',
    id: 't1',
    uri: 'spotify:track:t1',
    name: 'Song',
    duration_ms: 200000,
    artists: [
      { id: 'a1', name: 'Alpha' },
      { id: 'a2', name: 'Beta' },
    ],
    album: { name: 'Album' },
    external_ids: { isrc: 'ISRC1' },
    external_urls: { spotify: 'https://open.spotify.com/track/t1' },
  },
};

describe('mapPlaylistItem', () => {
  it('maps a normal track', () => {
    expect(mapPlaylistItem(track)).toEqual({
      addedAt: '2024-01-01T00:00:00Z',
      track: {
        key: 't1',
        id: 't1',
        uri: 'spotify:track:t1',
        name: 'Song',
        artists: [
          { id: 'a1', name: 'Alpha' },
          { id: 'a2', name: 'Beta' },
        ],
        album: 'Album',
        durationMs: 200000,
        isrc: 'ISRC1',
        spotifyUrl: 'https://open.spotify.com/track/t1',
        isLocal: false,
      },
    });
  });

  it('reads the legacy track field when item is absent', () => {
    expect(
      mapPlaylistItem({ ...track, item: undefined, track: track.item })?.track
        .key
    ).toBe('t1');
  });

  it('drops null items and episodes', () => {
    expect(mapPlaylistItem(null)).toBeNull();
    expect(mapPlaylistItem({ added_at: null, item: null })).toBeNull();
    expect(
      mapPlaylistItem({
        added_at: null,
        item: {
          type: 'episode',
          id: 'e',
          uri: 'spotify:episode:e',
          name: 'Ep',
        },
      })
    ).toBeNull();
  });

  it('keys local files by uri with null ids and no link', () => {
    const local = mapPlaylistItem({
      added_at: null,
      is_local: true,
      item: {
        type: 'track',
        id: null,
        uri: 'spotify:local:Artist:Album:Title:180',
        name: 'Title',
        duration_ms: 180000,
        artists: [{ id: null, name: 'Artist' }],
        album: { name: 'Album' },
        external_urls: { spotify: 'https://should-be-dropped' },
      },
    });
    expect(local?.track).toMatchObject({
      key: 'spotify:local:Artist:Album:Title:180',
      id: null,
      isLocal: true,
      spotifyUrl: null,
      artists: [{ id: null, name: 'Artist' }],
    });
  });
});

describe('buildEntries', () => {
  it('numbers positions and dedupes tracks', () => {
    const a = mapPlaylistItem(track)!;
    const b = mapPlaylistItem({
      ...track,
      item: { ...track.item!, id: 't2', uri: 'spotify:track:t2' } as never,
    })!;
    const { tracks, entries } = buildEntries('p1', [a, b, a]);
    expect(tracks.map((t) => t.key)).toEqual(['t1', 't2']);
    expect(entries).toEqual([
      { playlistId: 'p1', position: 0, trackKey: 't1', addedAt: a.addedAt },
      { playlistId: 'p1', position: 1, trackKey: 't2', addedAt: b.addedAt },
      { playlistId: 'p1', position: 2, trackKey: 't1', addedAt: a.addedAt },
    ]);
  });
});
