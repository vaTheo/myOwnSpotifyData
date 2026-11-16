import { describe, expect, it } from 'vitest';
import { classifyMixInput, normalizeMixUrl, requestKey } from './url';

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

describe('classifyMixInput', () => {
  it('classifies a normalizable permalink, canonicalised', () => {
    expect(
      classifyMixInput('https://m.soundcloud.com/user/some-mix?si=abc')
    ).toEqual({
      kind: 'permalink',
      url: 'https://soundcloud.com/user/some-mix',
    });
  });

  it('classifies an on.soundcloud.com short link, https-normalised', () => {
    expect(
      classifyMixInput('https://on.soundcloud.com/IPnhLSLBYZqoFYpagL')
    ).toEqual({
      kind: 'shortlink',
      url: 'https://on.soundcloud.com/IPnhLSLBYZqoFYpagL',
    });
  });

  it('forces http short links to https and lowercases the host, keeping the token case', () => {
    expect(
      classifyMixInput('http://On.SoundCloud.com/IPnhLSLBYZqoFYpagL')
    ).toEqual({
      kind: 'shortlink',
      url: 'https://on.soundcloud.com/IPnhLSLBYZqoFYpagL',
    });
  });

  it('returns null for junk that is neither', () => {
    expect(classifyMixInput('not a url')).toBeNull();
    expect(classifyMixInput('')).toBeNull();
    expect(classifyMixInput('https://example.com/user/mix')).toBeNull();
  });

  it('returns null for a bare on.soundcloud.com host with no token', () => {
    expect(classifyMixInput('https://on.soundcloud.com')).toBeNull();
    expect(classifyMixInput('https://on.soundcloud.com/')).toBeNull();
  });

  it('returns null for a bare soundcloud.com profile (not a track)', () => {
    expect(classifyMixInput('https://soundcloud.com/user')).toBeNull();
  });
});

describe('requestKey (worker round)', () => {
  it('normalises a SoundCloud permalink like normalizeMixUrl', () => {
    expect(requestKey('https://m.soundcloud.com/user/some-mix?in=x')).toBe(
      normalizeMixUrl('https://m.soundcloud.com/user/some-mix?in=x')
    );
    expect(requestKey('https://soundcloud.com/user/some-mix')).toBe(
      'https://soundcloud.com/user/some-mix'
    );
  });
  it('keeps a phone share link as it is: the worker follows it (spec 028)', () => {
    expect(requestKey('https://on.soundcloud.com/abc123')).toBe(
      'https://on.soundcloud.com/abc123'
    );
    // The form Look up saves the mix under, so a result joins that mix.
    const pasted = 'http://On.SoundCloud.com/abc123?x=1#f';
    expect(requestKey(pasted)).toBe('https://on.soundcloud.com/abc123?x=1#f');
    expect(requestKey(pasted)).toBe(classifyMixInput(pasted)?.url);
  });
  it('refuses a share link without a token and a SoundCloud profile', () => {
    expect(requestKey('https://on.soundcloud.com')).toBeNull();
    expect(requestKey('https://on.soundcloud.com/')).toBeNull();
    expect(requestKey('https://soundcloud.com/user')).toBeNull();
  });
  it('refuses http and free text', () => {
    expect(requestKey('http://www.youtube.com/watch?v=abc')).toBeNull();
    expect(requestKey('some mix I heard')).toBeNull();
    expect(requestKey('')).toBeNull();
  });
  it('keeps any other https link, dropping the hash, tracking params and host case', () => {
    expect(
      requestKey(
        'https://www.youtube.com/watch?v=abc&si=xyz&feature=share#t=10'
      )
    ).toBe('https://www.youtube.com/watch?v=abc');
    expect(
      requestKey('https://Mixcloud.com/a/b/?utm_source=x&utm_medium=y')
    ).toBe('https://mixcloud.com/a/b/');
    expect(requestKey('https://youtu.be/abc?t=5')).toBe(
      'https://youtu.be/abc?t=5'
    );
  });
});
