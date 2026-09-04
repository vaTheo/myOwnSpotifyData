import { describe, expect, it } from 'vitest';
import type { PlaylistRow } from '../db/schema';
import type { ApiPlaylistSummary } from '../spotify/types';
import { planSync, selectOwned, type ListedPlaylist } from './planner';

function api(id: string, owner = 'me', snapshot = 's1'): ApiPlaylistSummary {
  return {
    id,
    name: `P ${id}`,
    snapshot_id: snapshot,
    owner: { id: owner },
    images: [{ url: `https://i/${id}`, height: 1, width: 1 }],
    items: { total: 3 },
    external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
  };
}

function listed(id: string, snapshotId = 's1'): ListedPlaylist {
  return {
    id,
    name: `P ${id}`,
    snapshotId,
    itemCount: 3,
    imageUrl: null,
    spotifyUrl: null,
  };
}

function cached(id: string, snapshotId = 's1'): PlaylistRow {
  return { ...listed(id, snapshotId), syncedAt: 1 };
}

describe('selectOwned', () => {
  it('keeps playlists owned by me, mapping the fields the app stores', () => {
    const out = selectOwned(
      [api('a'), api('b', 'someone'), null, api('c')],
      'me'
    );
    expect(out.map((p) => p.id)).toEqual(['a', 'c']);
    expect(out[0]).toEqual({
      id: 'a',
      name: 'P a',
      snapshotId: 's1',
      itemCount: 3,
      imageUrl: 'https://i/a',
      spotifyUrl: 'https://open.spotify.com/playlist/a',
    });
  });

  it('falls back to tracks.total and tolerates missing optional fields', () => {
    const out = selectOwned(
      [
        {
          id: 'x',
          name: 'X',
          snapshot_id: 's',
          owner: { id: 'me' },
          tracks: { total: 7 },
        },
      ],
      'me'
    );
    expect(out[0]).toMatchObject({
      itemCount: 7,
      imageUrl: null,
      spotifyUrl: null,
    });
  });
});

describe('planSync', () => {
  it('partitions into delete, fetch and unchanged', () => {
    const plan = planSync(
      [listed('a'), listed('b', 's2'), listed('new')],
      [cached('a'), cached('b'), cached('gone')]
    );
    expect(plan.toDelete).toEqual(['gone']);
    expect(plan.toFetch.map((p) => p.id)).toEqual(['b', 'new']);
    expect(plan.unchanged).toEqual(['a']);
  });

  it('moves the priority playlist to the front when it needs fetching', () => {
    const plan = planSync([listed('a'), listed('b'), listed('c')], [], 'c');
    expect(plan.toFetch.map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });

  it('ignores a priority id that is unchanged or unknown', () => {
    const plan = planSync([listed('a'), listed('b')], [cached('b')], 'b');
    expect(plan.toFetch.map((p) => p.id)).toEqual(['a']);
    expect(planSync([listed('a')], [], 'zzz').toFetch.map((p) => p.id)).toEqual(
      ['a']
    );
  });
});
