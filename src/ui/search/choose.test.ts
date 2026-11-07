import { describe, expect, it } from 'vitest';
import type { AllRows } from '../../db/schema';
import { buildModel } from '../../model/aggregate';
import { detailOver, frameDetail, rememberRecent, resultHref } from './choose';
import type { SearchEntry } from './searchIndex';

function rows(): AllRows {
  return {
    playlists: [
      {
        id: 'p1',
        name: 'Deep',
        snapshotId: 's',
        itemCount: 2,
        imageUrl: null,
        spotifyUrl: null,
        syncedAt: 1,
      },
    ],
    tracks: [
      {
        key: 't1',
        id: 't1',
        uri: 'spotify:track:t1',
        name: 'One',
        artists: [{ id: 'a', name: 'A' }],
        album: '',
        durationMs: 1,
        isrc: null,
        spotifyUrl: null,
        isLocal: false,
      },
    ],
    entries: [
      { playlistId: 'p1', position: 0, trackKey: 'x', addedAt: null },
      { playlistId: 'p1', position: 4, trackKey: 't1', addedAt: null },
    ],
    topItems: [],
    plays: [],
    features: [],
    artistIdentity: [],
    artistReach: [],
  };
}

const model = buildModel(rows());

describe('resultHref (research D11)', () => {
  it('opens a track over the current screen', () => {
    const track = { kind: 'track' as const, id: 't1' };
    expect(resultHref({ name: 'top' }, model, track)).toBe('#/top?d=t1');
    expect(resultHref({ name: 'settings' }, model, track)).toBe(
      '#/settings?d=t1'
    );
    // Replaces an open sheet rather than stacking a second one.
    expect(
      resultHref({ name: 'crateView', view: 'gems', detail: 'z' }, model, track)
    ).toBe('#/crate/gems?d=t1');
  });

  it("selects the track's row on a playlist that holds it", () => {
    expect(detailOver({ name: 'playlist', id: 'p1' }, model, 't1')).toBe('4');
    expect(detailOver({ name: 'playlist', id: 'p1' }, model, 'h9')).toBe('h9');
    expect(detailOver({ name: 'top' }, model, 't1')).toBe('t1');
  });

  it('opens the route of an artist, a playlist or a mix', () => {
    const route = { name: 'top' as const, detail: 't1' };
    expect(resultHref(route, model, { kind: 'artist', id: 'name:a b' })).toBe(
      '#/artist/name%3Aa%20b'
    );
    expect(resultHref(route, model, { kind: 'playlist', id: 'p1' })).toBe(
      '#/playlist/p1'
    );
    expect(resultHref(route, model, { kind: 'mix', id: 'https://x.y/z' })).toBe(
      '#/mix/https%3A%2F%2Fx.y%2Fz'
    );
  });
});

describe('frameDetail', () => {
  it('is the detail of a screen without its own sheet', () => {
    expect(frameDetail({ name: 'settings', detail: 't' })).toBe('t');
    expect(frameDetail({ name: 'playlists', detail: 't' })).toBe('t');
    expect(frameDetail({ name: 'mix', key: 'k', detail: 't' })).toBe('t');
    expect(frameDetail({ name: 'settings' })).toBeNull();
    expect(frameDetail({ name: 'top', detail: 't' })).toBeNull();
    expect(frameDetail({ name: 'playlist', id: 'p', detail: '3' })).toBeNull();
  });
});

describe('rememberRecent', () => {
  const entry = (id: string): SearchEntry => ({
    kind: 'track',
    id,
    name: id,
    normalized: id,
    context: '',
    weight: 0,
  });

  it('keeps the last five, newest first, each once', () => {
    let recent: SearchEntry[] = [];
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'c']) {
      recent = rememberRecent(recent, entry(id));
    }
    expect(recent.map((e) => e.id)).toEqual(['c', 'f', 'e', 'd', 'b']);
  });
});
