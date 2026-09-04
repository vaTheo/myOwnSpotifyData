import { describe, expect, it } from 'vitest';
import { CRATE_VIEWS, parseRoute, routeHref } from './router';

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

  it('keeps a malformed escape rather than throwing', () => {
    expect(parseRoute('#/artist/%zz')).toEqual({ name: 'artist', key: '%zz' });
    expect(parseRoute('#/playlist/%E0%A4%A')).toEqual({
      name: 'playlist',
      id: '%E0%A4%A',
    });
  });

  it('treats a detail route without an id as its list', () => {
    expect(parseRoute('#/playlist/')).toEqual({ name: 'playlists' });
    expect(parseRoute('#/artist')).toEqual({ name: 'artists' });
  });

  it('parses the crate hub', () => {
    expect(parseRoute('#/crate')).toEqual({ name: 'crate' });
    expect(parseRoute('#/crate/')).toEqual({ name: 'crate' });
  });

  it('parses every crate view', () => {
    expect(CRATE_VIEWS).toEqual([
      'rotation',
      'gems',
      'classics',
      'year',
      'finish',
    ]);
    for (const view of CRATE_VIEWS) {
      expect(parseRoute(`#/crate/${view}`)).toEqual({
        name: 'crateView',
        view,
      });
    }
  });

  it('parses the period segment of the by-year route', () => {
    expect(parseRoute('#/crate/year/2022-06')).toEqual({
      name: 'crateView',
      view: 'year',
      period: '2022-06',
    });
  });

  it('sends an unknown crate view to the hub', () => {
    expect(parseRoute('#/crate/nope')).toEqual({ name: 'crate' });
    expect(parseRoute('#/crate/nope/2022-06')).toEqual({ name: 'crate' });
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
      { name: 'crate' },
      { name: 'crateView', view: 'rotation' },
      { name: 'crateView', view: 'year', period: '2022-06' },
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

  it('formats crate routes', () => {
    expect(routeHref({ name: 'crate' })).toBe('#/crate');
    expect(routeHref({ name: 'crateView', view: 'gems' })).toBe('#/crate/gems');
    expect(
      routeHref({ name: 'crateView', view: 'year', period: '2022-06' })
    ).toBe('#/crate/year/2022-06');
  });
});
