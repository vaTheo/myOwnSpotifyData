import { describe, expect, it } from 'vitest';
import { normalizeMixUrl } from './url';

describe('normalizeMixUrl', () => {
  it('returns a plain permalink unchanged', () => {
    expect(normalizeMixUrl('https://soundcloud.com/user/some-mix')).toBe(
      'https://soundcloud.com/user/some-mix'
    );
  });

  it('drops ?si= and ?utm_source= tracking params', () => {
    expect(
      normalizeMixUrl(
        'https://soundcloud.com/user/some-mix?si=abc123&utm_source=clipboard'
      )
    ).toBe('https://soundcloud.com/user/some-mix');
  });

  it('drops an ?in=user/sets/... param without touching the path', () => {
    expect(
      normalizeMixUrl(
        'https://soundcloud.com/user/some-mix?in=someone/sets/favourites'
      )
    ).toBe('https://soundcloud.com/user/some-mix');
  });

  it('drops a #fragment', () => {
    expect(normalizeMixUrl('https://soundcloud.com/user/some-mix#t=10')).toBe(
      'https://soundcloud.com/user/some-mix'
    );
  });

  it('rewrites m.soundcloud.com to soundcloud.com', () => {
    expect(normalizeMixUrl('https://m.soundcloud.com/user/some-mix')).toBe(
      'https://soundcloud.com/user/some-mix'
    );
  });

  it('rewrites www.soundcloud.com to soundcloud.com', () => {
    expect(normalizeMixUrl('https://www.soundcloud.com/user/some-mix')).toBe(
      'https://soundcloud.com/user/some-mix'
    );
  });

  it('strips exactly one trailing slash', () => {
    expect(normalizeMixUrl('https://soundcloud.com/user/some-mix/')).toBe(
      'https://soundcloud.com/user/some-mix'
    );
  });

  it('lowercases the host but preserves the path case', () => {
    expect(normalizeMixUrl('https://SoundCloud.com/User/Some-Mix')).toBe(
      'https://soundcloud.com/User/Some-Mix'
    );
  });

  it('rejects a non-SoundCloud host', () => {
    expect(normalizeMixUrl('https://example.com/user/some-mix')).toBeNull();
  });

  it('rejects an on.soundcloud.com short link', () => {
    expect(normalizeMixUrl('https://on.soundcloud.com/abc123XYZ')).toBeNull();
  });

  it('rejects a bare /user profile link, with or without a trailing slash', () => {
    expect(normalizeMixUrl('https://soundcloud.com/user')).toBeNull();
    expect(normalizeMixUrl('https://soundcloud.com/user/')).toBeNull();
  });

  it('rejects input that does not parse as a URL', () => {
    expect(normalizeMixUrl('not a url')).toBeNull();
    expect(normalizeMixUrl('')).toBeNull();
  });

  it('rejects a scheme-less paste', () => {
    expect(normalizeMixUrl('soundcloud.com/user/some-mix')).toBeNull();
  });

  it('rejects a non-http(s) scheme', () => {
    expect(normalizeMixUrl('ftp://soundcloud.com/user/some-mix')).toBeNull();
  });

  it('is idempotent: f(f(x)) === f(x)', () => {
    const inputs = [
      'https://soundcloud.com/user/some-mix',
      'https://m.soundcloud.com/user/some-mix?si=abc123',
      'https://SoundCloud.com/User/Some-Mix/',
    ];
    for (const input of inputs) {
      const once = normalizeMixUrl(input);
      expect(once).not.toBeNull();
      expect(normalizeMixUrl(once as string)).toBe(once);
    }
  });
});
