import { describe, expect, it } from 'vitest';
import { parseRoute, routeHref } from './router';

describe('parseRoute', () => {
  it('defaults to top for empty or unknown hashes', () => {
    expect(parseRoute('')).toEqual({ name: 'top' });
    expect(parseRoute('#')).toEqual({ name: 'top' });
    expect(parseRoute('#/nope')).toEqual({ name: 'top' });
  });

  it('parses every list screen', () => {
    expect(parseRoute('#/top')).toEqual({ name: 'top' });
    expect(parseRoute('#/playlists')).toEqual({ name: 'playlists' });
    expect(parseRoute('#/artists')).toEqual({ name: 'artists' });
    expect(parseRoute('#/import')).toEqual({ name: 'import' });
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
  });

  it('parses detail screens and decodes their ids', () => {
    expect(parseRoute('#/playlist/37i9dQ')).toEqual({
      name: 'playlist',
      id: '37i9dQ',
    });
    expect(parseRoute('#/artist/name%3Adaft%20punk')).toEqual({
      name: 'artist',
      key: 'name:daft punk',
    });
  });

  it('treats a detail route without an id as its list', () => {
    expect(parseRoute('#/playlist/')).toEqual({ name: 'playlists' });
    expect(parseRoute('#/artist')).toEqual({ name: 'artists' });
  });
});

describe('routeHref', () => {
  it('round-trips every route', () => {
    const routes = [
      { name: 'top' },
      { name: 'playlists' },
      { name: 'playlist', id: 'abc' },
      { name: 'artists' },
      { name: 'artist', key: 'name:daft punk' },
      { name: 'import' },
      { name: 'settings' },
    ] as const;
    for (const r of routes) {
      expect(parseRoute(routeHref(r))).toEqual(r);
    }
  });

  it('encodes ids', () => {
    expect(routeHref({ name: 'artist', key: 'name:daft punk' })).toBe(
      '#/artist/name%3Adaft%20punk'
    );
  });
});
