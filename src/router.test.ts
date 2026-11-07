import { describe, expect, it } from 'vitest';
import {
  CRATE_VIEWS,
  destinationOf,
  parseRoute,
  routeHref,
  sameScreen,
  visitEntry,
  withDetailOf,
} from './router';

describe('withDetailOf', () => {
  it('sets and drops the detail of a list route', () => {
    expect(withDetailOf({ name: 'top' }, 't1')).toEqual({
      name: 'top',
      detail: 't1',
    });
    expect(
      withDetailOf({ name: 'playlist', id: 'p', detail: '3' }, undefined)
    ).toEqual({ name: 'playlist', id: 'p' });
    expect(
      routeHref(withDetailOf({ name: 'artist', key: 'a', detail: 'x' }, null))
    ).toBe('#/artist/a');
  });

  it('puts a searched track over a screen without a list (US7)', () => {
    expect(withDetailOf({ name: 'settings' }, 't1')).toEqual({
      name: 'settings',
      detail: 't1',
    });
    expect(routeHref(withDetailOf({ name: 'mix', key: 'u' }, 't1'))).toBe(
      '#/mix/u?d=t1'
    );
  });
});

describe('sameScreen', () => {
  it('is true when only the detail differs', () => {
    expect(sameScreen({ name: 'top' }, { name: 'top', detail: 't1' })).toBe(
      true
    );
    expect(
      sameScreen(
        { name: 'crateView', view: 'year', period: '2026-08', detail: 'a' },
        { name: 'crateView', view: 'year', period: '2026-08' }
      )
    ).toBe(true);
  });

  it('is false for another screen', () => {
    expect(
      sameScreen({ name: 'playlist', id: 'a' }, { name: 'playlist', id: 'b' })
    ).toBe(false);
    expect(sameScreen({ name: 'top' }, { name: 'crate' })).toBe(false);
  });
});

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

describe('visitEntry', () => {
  /** A stub history: one entry's state, replaced in place. */
  function fakeHistory(state: unknown) {
    const h = {
      state,
      replaceState(next: unknown) {
        h.state = next;
      },
    };
    return h;
  }

  it('stamps an unvisited entry and calls it a new navigation', () => {
    const h = fakeHistory(null);
    expect(visitEntry(h)).toBe(true);
    expect(h.state).toEqual({ djVisited: true });
  });

  it('reports back and forward on an entry it already stamped', () => {
    const h = fakeHistory(null);
    visitEntry(h);
    expect(visitEntry(h)).toBe(false);
    expect(h.state).toEqual({ djVisited: true });
  });

  it('keeps whatever else the entry state holds', () => {
    const h = fakeHistory({ scrollTop: 320 });
    expect(visitEntry(h)).toBe(true);
    expect(h.state).toEqual({ scrollTop: 320, djVisited: true });
  });

  it('stamps a state that is not an object', () => {
    const h = fakeHistory('replaced by the OAuth cleanup');
    expect(visitEntry(h)).toBe(true);
    expect(h.state).toEqual({ djVisited: true });
  });
});

describe('the detail parameter (spec 003)', () => {
  it('parses ?d= on the list routes', () => {
    expect(parseRoute('#/top?d=4uLU6hMCjMI75M1A2tKUQC')).toEqual({
      name: 'top',
      detail: '4uLU6hMCjMI75M1A2tKUQC',
    });
    expect(parseRoute('#/playlist/abc?d=12')).toEqual({
      name: 'playlist',
      id: 'abc',
      detail: '12',
    });
    expect(parseRoute('#/artist/x1?d=t9')).toEqual({
      name: 'artist',
      key: 'x1',
      detail: 't9',
    });
    expect(parseRoute('#/crate/year/2026-08?d=t9')).toEqual({
      name: 'crateView',
      view: 'year',
      period: '2026-08',
      detail: 't9',
    });
  });

  it('keeps ?d= on every other screen: a search result over it (US7)', () => {
    expect(parseRoute('#/playlists?d=1')).toEqual({
      name: 'playlists',
      detail: '1',
    });
    expect(parseRoute('#/settings?d=1')).toEqual({
      name: 'settings',
      detail: '1',
    });
    expect(parseRoute('#/crate?d=1')).toEqual({ name: 'crate', detail: '1' });
    expect(parseRoute('#/mix/a%2Fb?d=t')).toEqual({
      name: 'mix',
      key: 'a/b',
      detail: 't',
    });
  });

  it('ignores an empty ?d=', () => {
    expect(parseRoute('#/top?d=')).toEqual({ name: 'top' });
  });

  it('round-trips a detail through routeHref', () => {
    const routes = [
      { name: 'top', detail: 'abc' },
      { name: 'playlist', id: 'p 1', detail: '12' },
      { name: 'artist', key: 'name:daft punk', detail: 'x/y' },
      { name: 'crateView', view: 'year', period: '2022-06', detail: 'z' },
    ] as const;
    for (const r of routes) expect(parseRoute(routeHref(r))).toEqual(r);
  });
});

describe('the mix key (spec 003)', () => {
  it('parses #/mix/<key> and round-trips a saved mix url', () => {
    const key = 'https://soundcloud.com/demo-dj/peak-time?in=a/b';
    const href = routeHref({ name: 'mix', key });
    expect(href).toBe(`#/mix/${encodeURIComponent(key)}`);
    expect(parseRoute(href)).toEqual({ name: 'mix', key });
  });

  it('keeps #/mix without a key', () => {
    expect(parseRoute('#/mix')).toEqual({ name: 'mix' });
    expect(parseRoute('#/mix/')).toEqual({ name: 'mix' });
    expect(routeHref({ name: 'mix' })).toBe('#/mix');
  });
});

describe('destinationOf (spec 003, contracts/routes.md)', () => {
  it('places every route in its destination and tab', () => {
    expect(destinationOf({ name: 'top' })).toEqual({
      destination: 'listening',
      tab: 'top',
    });
    expect(destinationOf({ name: 'crate' })).toEqual({
      destination: 'listening',
      tab: 'crate',
    });
    expect(destinationOf({ name: 'crateView', view: 'gems' })).toEqual({
      destination: 'listening',
      tab: 'crate',
    });
    expect(destinationOf({ name: 'playlists' })).toEqual({
      destination: 'library',
      tab: 'playlists',
    });
    expect(destinationOf({ name: 'playlist', id: 'a' })).toEqual({
      destination: 'library',
      tab: 'playlists',
    });
    expect(destinationOf({ name: 'artists' })).toEqual({
      destination: 'library',
      tab: 'artists',
    });
    expect(destinationOf({ name: 'artist', key: 'a' })).toEqual({
      destination: 'library',
      tab: 'artists',
    });
    expect(destinationOf({ name: 'mix' })).toEqual({ destination: 'mix' });
    expect(destinationOf({ name: 'mix', key: 'k' })).toEqual({
      destination: 'mix',
    });
    expect(destinationOf({ name: 'settings' })).toEqual({
      destination: 'settings',
    });
    expect(destinationOf({ name: 'import' })).toEqual({
      destination: 'settings',
    });
  });
});
