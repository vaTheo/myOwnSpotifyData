import { describe, expect, it } from 'vitest';
import { addressAfter, routeAction } from './address';

const A = 'https://soundcloud.com/dj/a';
const B = 'https://soundcloud.com/dj/b';

describe('routeAction: what an address asks of the workspace', () => {
  it('waits for the saved mixes before deciding', () => {
    expect(
      routeAction({
        prevKey: undefined,
        key: A,
        loaded: false,
        openUrl: null,
        saved: [A],
      })
    ).toBe('none');
  });

  it('opens a saved mix named by the address', () => {
    expect(
      routeAction({
        prevKey: undefined,
        key: A,
        loaded: true,
        openUrl: null,
        saved: [A],
      })
    ).toBe('open');
    expect(
      routeAction({
        prevKey: A,
        key: B,
        loaded: true,
        openUrl: A,
        saved: [A, B],
      })
    ).toBe('open');
  });

  it('leaves alone the mix already open', () => {
    expect(
      routeAction({
        prevKey: undefined,
        key: A,
        loaded: true,
        openUrl: A,
        saved: [A],
      })
    ).toBe('none');
  });

  it('says "missing" for a key this browser has not saved', () => {
    expect(
      routeAction({
        prevKey: undefined,
        key: A,
        loaded: true,
        openUrl: null,
        saved: [B],
      })
    ).toBe('missing');
  });

  it('closes the mix when Back leaves its address', () => {
    expect(
      routeAction({
        prevKey: A,
        key: undefined,
        loaded: true,
        openUrl: A,
        saved: [A],
      })
    ).toBe('close');
  });

  it('keeps an unsaved lookup open at #/mix', () => {
    expect(
      routeAction({
        prevKey: A,
        key: undefined,
        loaded: true,
        openUrl: B,
        saved: [A],
      })
    ).toBe('none');
    expect(
      routeAction({
        prevKey: undefined,
        key: undefined,
        loaded: true,
        openUrl: B,
        saved: [],
      })
    ).toBe('none');
  });
});

describe('addressAfter: the address the open mix asks for', () => {
  it('names a saved mix that is open', () => {
    expect(addressAfter({ key: undefined, openUrl: A, saved: true })).toBe(
      `#/mix/${encodeURIComponent(A)}`
    );
    expect(addressAfter({ key: B, openUrl: A, saved: true })).toBe(
      `#/mix/${encodeURIComponent(A)}`
    );
  });

  it('returns to #/mix for an unsaved lookup', () => {
    expect(addressAfter({ key: A, openUrl: B, saved: false })).toBe('#/mix');
  });

  it('changes nothing when the address already fits or no mix is open', () => {
    expect(addressAfter({ key: A, openUrl: A, saved: true })).toBeNull();
    expect(
      addressAfter({ key: undefined, openUrl: B, saved: false })
    ).toBeNull();
    expect(
      addressAfter({ key: undefined, openUrl: null, saved: false })
    ).toBeNull();
  });

  it('leaves an addressed mix that is no longer on screen, unless told to hold', () => {
    expect(addressAfter({ key: A, openUrl: null, saved: false })).toBe('#/mix');
    expect(
      addressAfter({ key: A, openUrl: null, saved: false, hold: true })
    ).toBeNull();
  });
});
