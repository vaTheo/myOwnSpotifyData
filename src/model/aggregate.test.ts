import { describe, expect, it } from 'vitest';
import type { AllRows, ArtistRef, PlaylistRow, TrackRow } from '../db/schema';
import {
  artistKey,
  artistTracks,
  buildModel,
  playlistRanking,
  playsFor,
  topArtists,
  topTracks,
} from './aggregate';

const daft = { id: 'daft', name: 'Daft Punk' };
const justice = { id: 'justice', name: 'Justice' };
const localArtist = { id: null, name: 'Local Hero' };

function track(
  key: string,
  artists: ArtistRef[] = [daft],
  over: Partial<TrackRow> = {}
): TrackRow {
  return {
    key,
    id: key.startsWith('spotify:local:') ? null : key,
    uri: key.startsWith('spotify:') ? key : `spotify:track:${key}`,
    name: `Song ${key}`,
    artists,
    album: 'Album',
    durationMs: 1000,
    isrc: null,
    spotifyUrl: null,
    isLocal: key.startsWith('spotify:local:'),
    ...over,
  };
}

function playlist(id: string, name = id): PlaylistRow {
  return {
    id,
    name,
    snapshotId: 's',
    itemCount: 0,
    imageUrl: null,
    spotifyUrl: null,
    syncedAt: 1,
  };
}

const rows: AllRows = {
  playlists: [playlist('p2', 'Zulu'), playlist('p1', 'Alpha')],
  tracks: [
    track('t1'),
    track('t2', [daft, justice]),
    track('t3', [justice]),
    track('spotify:local:x', [localArtist]),
    track('t4', [daft], { name: 'Relinked Song' }),
  ],
  entries: [
    { playlistId: 'p1', position: 1, trackKey: 't2', addedAt: null },
    { playlistId: 'p1', position: 0, trackKey: 't1', addedAt: null },
    { playlistId: 'p1', position: 2, trackKey: 't4', addedAt: null },
    { playlistId: 'p2', position: 0, trackKey: 't2', addedAt: null },
    { playlistId: 'p2', position: 1, trackKey: 't3', addedAt: null },
    {
      playlistId: 'p2',
      position: 2,
      trackKey: 'spotify:local:x',
      addedAt: null,
    },
    { playlistId: 'gone', position: 0, trackKey: 't1', addedAt: null },
  ],
  topItems: [
    {
      key: 'tracks:short_term',
      type: 'tracks',
      period: 'short_term',
      fetchedAt: 1,
      items: [
        {
          rank: 1,
          id: 't3',
          name: 'Song t3',
          artists: [justice],
          album: '',
          imageUrl: null,
          spotifyUrl: null,
        },
        {
          rank: 2,
          id: 't1',
          name: 'Song t1',
          artists: [daft],
          album: '',
          imageUrl: null,
          spotifyUrl: null,
        },
        {
          rank: 3,
          id: 'unsaved',
          name: 'Not saved',
          artists: [daft],
          album: '',
          imageUrl: null,
          spotifyUrl: null,
        },
      ],
    },
    {
      key: 'artists:short_term',
      type: 'artists',
      period: 'short_term',
      fetchedAt: 1,
      items: [
        {
          rank: 1,
          id: 'daft',
          name: 'Daft Punk',
          imageUrl: null,
          spotifyUrl: null,
        },
        {
          rank: 2,
          id: 'nobody',
          name: 'Nobody',
          imageUrl: null,
          spotifyUrl: null,
        },
      ],
    },
  ],
  plays: [
    {
      trackId: 't1',
      plays: 10,
      msPlayed: 1,
      firstTs: '',
      lastTs: '',
      trackName: 'Song t1',
      artistName: 'Daft Punk',
    },
    {
      trackId: 't2',
      plays: 5,
      msPlayed: 1,
      firstTs: '',
      lastTs: '',
      trackName: 'Song t2',
      artistName: 'Daft Punk',
    },
    {
      trackId: 'other-id',
      plays: 7,
      msPlayed: 2,
      firstTs: '',
      lastTs: '',
      trackName: 'Relinked Song',
      artistName: 'DAFT PUNK',
    },
    {
      trackId: 'other-id-2',
      plays: 1,
      msPlayed: 3,
      firstTs: '',
      lastTs: '',
      trackName: 'Relinked Song',
      artistName: 'Daft Punk',
    },
  ],
};

const model = buildModel(rows);

describe('buildModel', () => {
  it('sorts playlists by name and drops entries of unknown playlists', () => {
    expect(model.playlists.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(model.entriesByPlaylist.has('gone')).toBe(false);
    expect(model.entriesByPlaylist.get('p1')?.map((e) => e.trackKey)).toEqual([
      't1',
      't2',
      't4',
    ]);
  });

  it('ranks artists by distinct saved tracks and keys local artists by name', () => {
    expect(
      model.artists.map((a) => [a.key, a.trackKeys.size, a.playlistIds.size])
    ).toEqual([
      ['daft', 3, 2],
      ['justice', 2, 2],
      ['name:local hero', 1, 1],
    ]);
    expect(artistKey(localArtist)).toBe('name:local hero');
  });

  it('maps tracks to playlists', () => {
    expect([...model.playlistsOfTrack.get('t2')!]).toEqual(['p1', 'p2']);
    expect([...model.playlistsOfTrack.get('t1')!]).toEqual(['p1']);
  });
});

describe('playsFor', () => {
  it('prefers the exact id and falls back to artist and title', () => {
    expect(playsFor(model, track('t1'))).toEqual({
      plays: 10,
      msPlayed: 1,
      source: 'id',
    });
    expect(
      playsFor(model, track('t4', [daft], { name: 'Relinked Song' }))
    ).toEqual({
      plays: 8,
      msPlayed: 5,
      source: 'name',
    });
    expect(playsFor(model, track('t3', [justice]))).toBeNull();
    expect(playsFor(model, track('x', []))).toBeNull();
  });
});

describe('playlistRanking', () => {
  it('sorts by plays, then top rank, then position, and flags top lists', () => {
    const ranked = playlistRanking(model, 'p1');
    expect(
      ranked.map((r) => [r.track.key, r.plays?.plays ?? 0, r.inTop])
    ).toEqual([
      ['t1', 10, ['short_term']],
      ['t4', 8, []],
      ['t2', 5, []],
    ]);
    const p2 = playlistRanking(model, 'p2');
    expect(p2.map((r) => r.track.key)).toEqual(['t2', 't3', 'spotify:local:x']);
    expect(playlistRanking(model, 'nope')).toEqual([]);
  });
});

describe('top lists', () => {
  it('annotates top tracks with playlists and plays', () => {
    expect(
      topTracks(model, 'short_term').map((t) => [
        t.item.id,
        t.playlistIds,
        t.plays?.plays ?? null,
      ])
    ).toEqual([
      ['t3', ['p2'], null],
      ['t1', ['p1'], 10],
      ['unsaved', [], null],
    ]);
    expect(topTracks(model, 'long_term')).toEqual([]);
  });

  it('annotates top artists with saved track counts', () => {
    expect(
      topArtists(model, 'short_term').map((a) => [
        a.item.id,
        a.savedTracks,
        a.playlistCount,
      ])
    ).toEqual([
      ['daft', 3, 2],
      ['nobody', 0, 0],
    ]);
  });
});

describe('artistTracks', () => {
  it('lists an artist’s saved tracks by plays with their playlists', () => {
    expect(
      artistTracks(model, 'daft').map((t) => [
        t.track.key,
        t.plays?.plays ?? 0,
        t.playlistIds,
      ])
    ).toEqual([
      ['t1', 10, ['p1']],
      ['t4', 8, ['p1']],
      ['t2', 5, ['p1', 'p2']],
    ]);
    expect(artistTracks(model, 'nope')).toEqual([]);
  });
});
