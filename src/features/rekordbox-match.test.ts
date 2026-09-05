import { describe, expect, it } from 'vitest';
import type { RbTrack } from './rekordbox';
import {
  cleanTitle,
  matchRekordbox,
  primaryArtist,
  type LibraryTrack,
} from './rekordbox-match';

function lib(
  id: string,
  name: string,
  artists: string[],
  durationMs: number
): LibraryTrack {
  return { id, name, artists, durationMs };
}

function rb(
  title: string,
  artist: string,
  over: Partial<RbTrack> = {}
): RbTrack {
  return {
    title,
    artist,
    bpm: 128,
    key: { key: 9, major: false },
    seconds: 300,
    ...over,
  };
}

describe('cleanTitle', () => {
  it('drops feat tails and the generic mix markers', () => {
    expect(cleanTitle('Strobe (Original Mix)')).toBe('strobe');
    expect(cleanTitle('Strobe - Original Mix')).toBe('strobe');
    expect(cleanTitle('Voodoo Ray [Extended Mix]')).toBe('voodoo ray');
    expect(cleanTitle('Voodoo Ray - Radio Edit')).toBe('voodoo ray');
    expect(cleanTitle('Losing It (feat. Anna)')).toBe('losing it');
    expect(cleanTitle('Losing It feat. Anna')).toBe('losing it');
    expect(cleanTitle('Losing It ft. Anna')).toBe('losing it');
  });

  it('keeps a remix tail, which names a different recording', () => {
    expect(cleanTitle('Losing It (Ted Remix)')).toBe('losing it ted remix');
    expect(cleanTitle('Losing It - Ted Remix')).toBe('losing it ted remix');
    expect(cleanTitle('Losing It feat. Anna (Ted Remix)')).toBe(
      'losing it ted remix'
    );
  });

  it('normalises punctuation and case', () => {
    expect(cleanTitle("Don't You Want Me (Extended Mix)")).toBe(
      'don t you want me'
    );
    expect(cleanTitle('Björk')).toBe('bjork');
  });
});

describe('primaryArtist', () => {
  it('takes the first artist of a joined credit', () => {
    expect(primaryArtist('Fatboy Slim & Riva Starr')).toBe('Fatboy Slim');
    expect(primaryArtist('Kolsch, Sasha')).toBe('Kolsch');
    expect(primaryArtist('Boys Noize x Skrillex')).toBe('Boys Noize');
    expect(primaryArtist('Calvin Harris feat. Dua Lipa')).toBe('Calvin Harris');
    expect(primaryArtist('Calvin Harris ft. Dua Lipa')).toBe('Calvin Harris');
    expect(primaryArtist('Calvin Harris featuring Dua Lipa')).toBe(
      'Calvin Harris'
    );
  });

  it('leaves a single credit alone', () => {
    expect(primaryArtist('Jamie xx')).toBe('Jamie xx');
    expect(primaryArtist('Daft Punk')).toBe('Daft Punk');
    expect(primaryArtist('deadmau5')).toBe('deadmau5');
    expect(primaryArtist('')).toBe('');
  });
});

describe('matchRekordbox', () => {
  it('matches a unique title and artist', () => {
    const library = [
      lib('t1', 'Strobe (Original Mix)', ['deadmau5'], 638000),
      lib('t2', 'Voodoo Ray', ['A Guy Called Gerald'], 400000),
    ];
    const result = matchRekordbox(
      [rb('Strobe', 'deadmau5', { seconds: 638 })],
      library,
      7
    );
    expect(result).toEqual({
      matches: [
        {
          trackId: 't1',
          value: {
            bpm: 128,
            key: 9,
            major: false,
            energy: null,
            fetchedAt: 7,
            matchedBy: 'title-artist',
            rbTitle: 'Strobe',
            rbArtist: 'deadmau5',
          },
        },
      ],
      unmatched: 0,
    });
  });

  it('breaks a tie on a duration within two seconds', () => {
    const library = [
      lib('short', 'Losing It', ['Fisher'], 224000),
      lib('long', 'Losing It', ['Fisher'], 421500),
    ];
    const result = matchRekordbox(
      [rb('Losing It (Original Mix)', 'Fisher', { seconds: 420 })],
      library,
      7
    );
    expect(result.unmatched).toBe(0);
    expect(result.matches[0].trackId).toBe('long');
    expect(result.matches[0].value.matchedBy).toBe('title-artist-duration');
  });

  it('leaves ambiguous, durationless and absent tracks unmatched', () => {
    const library = [
      lib('a1', 'Losing It', ['Fisher'], 224000),
      lib('a2', 'Losing It', ['Fisher'], 225000),
    ];
    const result = matchRekordbox(
      [
        rb('Losing It', 'Fisher', { seconds: 224 }),
        rb('Losing It', 'Fisher', { seconds: null }),
        rb('Nothing Like It', 'Nobody At All'),
      ],
      library,
      7
    );
    expect(result).toEqual({ matches: [], unmatched: 3 });
  });

  it('skips library entries without a Spotify id', () => {
    const library = [lib('', 'Untitled Loop', ['deadmau5'], 200000)];
    const result = matchRekordbox(
      [rb('Untitled Loop', 'deadmau5', { seconds: 200 })],
      library,
      7
    );
    expect(result).toEqual({ matches: [], unmatched: 1 });
  });

  it('matches both collection copies of the same track', () => {
    const library = [lib('t1', 'Strobe', ['deadmau5'], 638000)];
    const result = matchRekordbox(
      [
        rb('Strobe', 'deadmau5', { seconds: 638 }),
        rb('Strobe (Original Mix)', 'deadmau5', { seconds: 638, bpm: 127.5 }),
      ],
      library,
      7
    );
    expect(result.unmatched).toBe(0);
    expect(result.matches.map((m) => m.trackId)).toEqual(['t1', 't1']);
    expect(result.matches[1].value.bpm).toBe(127.5);
  });

  it('defaults fetchedAt to zero when no clock is passed', () => {
    const library = [lib('t1', 'Strobe', ['deadmau5'], 638000)];
    const result = matchRekordbox([rb('Strobe', 'deadmau5')], library);
    expect(result.matches[0].value.fetchedAt).toBe(0);
  });
});
