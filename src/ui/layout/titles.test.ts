import { describe, expect, it } from 'vitest';
import { buildModel } from '../../model/aggregate';
import { screenTitle } from './titles';

const model = buildModel({
  playlists: [
    {
      id: 'p1',
      name: 'Peak Time Techno',
      snapshotId: 's',
      itemCount: 1,
      imageUrl: null,
      spotifyUrl: null,
      syncedAt: 0,
    },
  ],
  tracks: [
    {
      key: 't1',
      id: 't1',
      uri: 'spotify:track:t1',
      name: 'Nightdrive',
      artists: [{ id: 'a1', name: 'Kiasmos' }],
      album: 'A',
      durationMs: 1,
      isrc: null,
      spotifyUrl: null,
      isLocal: false,
    },
  ],
  entries: [{ playlistId: 'p1', position: 0, trackKey: 't1', addedAt: null }],
  topItems: [],
  plays: [],
  features: [],
  artistIdentity: [],
  artistReach: [],
});

describe('screenTitle', () => {
  it('names a tab root after its destination, with no way up', () => {
    expect(screenTitle({ name: 'overview' }, model)).toEqual({
      title: 'Overview',
      up: null,
    });
    expect(screenTitle({ name: 'top' }, model)).toEqual({
      title: 'Listening',
      up: null,
    });
    expect(screenTitle({ name: 'crate' }, model)).toEqual({
      title: 'Listening',
      up: null,
    });
    expect(screenTitle({ name: 'playlists' }, model)).toEqual({
      title: 'Library',
      up: null,
    });
    expect(screenTitle({ name: 'artists' }, model).title).toBe('Library');
    expect(screenTitle({ name: 'mix' }, model).title).toBe('Mix');
    expect(screenTitle({ name: 'mix', key: 'k' }, model).title).toBe('Mix');
    expect(screenTitle({ name: 'settings' }, model).title).toBe('Settings');
  });

  it('names a detail after its item and leads up to its list', () => {
    expect(screenTitle({ name: 'playlist', id: 'p1' }, model)).toEqual({
      title: 'Peak Time Techno',
      up: '#/playlists',
    });
    expect(screenTitle({ name: 'artist', key: 'a1' }, model)).toEqual({
      title: 'Kiasmos',
      up: '#/artists',
    });
    expect(screenTitle({ name: 'crateView', view: 'gems' }, model)).toEqual({
      title: 'Forgotten gems',
      up: '#/crate',
    });
    expect(screenTitle({ name: 'import' }, model)).toEqual({
      title: 'Import listening history',
      up: '#/settings',
    });
  });

  it('falls back to a generic name before the library has loaded', () => {
    expect(screenTitle({ name: 'playlist', id: 'zz' }, null).title).toBe(
      'Playlist'
    );
    expect(screenTitle({ name: 'artist', key: 'zz' }, model).title).toBe(
      'Artist'
    );
  });
});
