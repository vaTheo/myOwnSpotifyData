import { describe, expect, it } from 'vitest';
import {
  classifyMixInput,
  isShortLink,
  normalizeMixUrl,
  permalinkCandidates,
  permalinkFromOembed,
} from './url';

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

describe('isShortLink', () => {
  it('is true only for an on.soundcloud.com link', () => {
    expect(isShortLink('https://on.soundcloud.com/IPnhLSLBYZqoFYpagL')).toBe(
      true
    );
    expect(isShortLink('https://soundcloud.com/user/some-mix')).toBe(false);
    expect(isShortLink('not a url')).toBe(false);
  });
});

describe('permalinkFromOembed', () => {
  it('reconstructs the Lot Radio permalink from the profile and title', () => {
    expect(
      permalinkFromOembed(
        'https://soundcloud.com/thelotradio',
        'Naone @ The Lot Radio 01-11-2025'
      )
    ).toBe('https://soundcloud.com/thelotradio/naone-the-lot-radio-01-11-2025');
  });

  it('strips a trailing " by <author>" suffix (the real oEmbed title shape)', () => {
    // Verified 2026-09-06: oEmbed returns the title WITH " by The Lot Radio";
    // the real permalink slug omits it, so the suffix must be dropped or
    // TrackId returns rowCount 0 for the -by-... tail.
    expect(
      permalinkFromOembed(
        'https://soundcloud.com/thelotradio',
        'Naone @ The Lot Radio 01-11-2025 by The Lot Radio',
        'The Lot Radio'
      )
    ).toBe('https://soundcloud.com/thelotradio/naone-the-lot-radio-01-11-2025');
  });

  it('leaves the title alone when the author suffix is absent or would empty it', () => {
    // No " by <author>" tail: unchanged.
    expect(
      permalinkFromOembed('https://soundcloud.com/u', 'A Mix - Live', 'Someone')
    ).toBe('https://soundcloud.com/u/a-mix-live');
    // Stripping would leave nothing: keep the original.
    expect(
      permalinkFromOembed('https://soundcloud.com/u', 'by DJ X', 'DJ X')
    ).toBe('https://soundcloud.com/u/by-dj-x');
  });

  it('strips even when the real slug may keep the suffix (guard catches it)', () => {
    // A mix genuinely titled "… by <author>" reconstructs one segment short;
    // the TrackId guard turns that into notFound, never a wrong mix (§8). This
    // is the accepted limitation the design records, pinned as a test.
    expect(
      permalinkFromOembed('https://soundcloud.com/u', 'Mixed by DJ X', 'DJ X')
    ).toBe('https://soundcloud.com/u/mixed');
  });

  it('strips diacritics via NFKD before slugging', () => {
    expect(
      permalinkFromOembed('https://soundcloud.com/cafe', 'Café Del Mar Mix')
    ).toBe('https://soundcloud.com/cafe/cafe-del-mar-mix');
  });

  it('returns null when the title slugs to nothing (empty or symbol-only)', () => {
    expect(permalinkFromOembed('https://soundcloud.com/user', '')).toBeNull();
    expect(permalinkFromOembed('https://soundcloud.com/user', '@')).toBeNull();
  });

  it('returns null when author_url is not a one-segment soundcloud profile', () => {
    // A track permalink (two segments), not a profile.
    expect(
      permalinkFromOembed(
        'https://soundcloud.com/thelotradio/some-set',
        'Some Mix'
      )
    ).toBeNull();
    // A foreign host.
    expect(
      permalinkFromOembed('https://example.com/thelotradio', 'Some Mix')
    ).toBeNull();
    // Not a URL at all.
    expect(permalinkFromOembed('thelotradio', 'Some Mix')).toBeNull();
  });
});

describe('permalinkCandidates', () => {
  it('offers both the apostrophe-dropped and the apostrophe-as-hyphen slug', () => {
    // SoundCloud DROPS the apostrophe (don't -> dont); the older slug turned it
    // into a hyphen (don-t). Both spellings are tried so the guard can pick.
    const out = permalinkCandidates('https://soundcloud.com/dj', "Don't Stop");
    expect(out).toContain('https://soundcloud.com/dj/dont-stop');
    expect(out).toContain('https://soundcloud.com/dj/don-t-stop');
  });

  it('transliterates ß / ø / æ the way SoundCloud does, not to a hyphen', () => {
    // None of these decompose under NFKD, so the old slug dropped each to a
    // hyphen; the transliteration map turns them into ss / o / ae.
    expect(
      permalinkCandidates('https://soundcloud.com/x', 'Große Straße Fest')[0]
    ).toBe('https://soundcloud.com/x/grosse-strasse-fest');
    expect(
      permalinkCandidates('https://soundcloud.com/x', 'Øya Æther œuvre')[0]
    ).toBe('https://soundcloud.com/x/oya-aether-oeuvre');
  });

  it('offers both the suffix-stripped and the not-stripped slug', () => {
    const out = permalinkCandidates(
      'https://soundcloud.com/lr',
      'Naone @ The Lot Radio by The Lot Radio',
      'The Lot Radio'
    );
    expect(out).toContain('https://soundcloud.com/lr/naone-the-lot-radio');
    expect(out).toContain(
      'https://soundcloud.com/lr/naone-the-lot-radio-by-the-lot-radio'
    );
  });

  it('dedupes candidates that collapse to the same slug', () => {
    // Rock 'n' Roll: the ' n ' run collapses to a single hyphen under BOTH the
    // apostrophe-removed and apostrophe-as-hyphen rules, so all four variants
    // (no author suffix here) become one candidate.
    expect(
      permalinkCandidates('https://soundcloud.com/dj', "Rock 'n' Roll")
    ).toEqual(['https://soundcloud.com/dj/rock-n-roll']);
  });

  it('collapses to a single candidate when there is no apostrophe or suffix', () => {
    expect(
      permalinkCandidates('https://soundcloud.com/x', 'Simple Mix')
    ).toEqual(['https://soundcloud.com/x/simple-mix']);
  });

  it('returns [] when the title slugs to nothing (empty or symbol-only)', () => {
    expect(permalinkCandidates('https://soundcloud.com/x', '')).toEqual([]);
    expect(permalinkCandidates('https://soundcloud.com/x', '@')).toEqual([]);
  });

  it('returns [] when author_url is not a one-segment soundcloud profile', () => {
    // Two segments (a track permalink, not a profile).
    expect(
      permalinkCandidates('https://soundcloud.com/x/some-set', 'Some Mix')
    ).toEqual([]);
    // Foreign host.
    expect(permalinkCandidates('https://example.com/x', 'Some Mix')).toEqual(
      []
    );
    // Not a URL at all.
    expect(permalinkCandidates('x', 'Some Mix')).toEqual([]);
  });

  it('orders suffix-stripped + apostrophe-removed first, four distinct spellings', () => {
    // Both an intra-word apostrophe AND a " by <author>" suffix: all four
    // variants are distinct, and the order is fixed.
    expect(
      permalinkCandidates(
        'https://soundcloud.com/dj',
        "Don't Stop by DJ X",
        'DJ X'
      )
    ).toEqual([
      'https://soundcloud.com/dj/dont-stop',
      'https://soundcloud.com/dj/don-t-stop',
      'https://soundcloud.com/dj/dont-stop-by-dj-x',
      'https://soundcloud.com/dj/don-t-stop-by-dj-x',
    ]);
  });
});
