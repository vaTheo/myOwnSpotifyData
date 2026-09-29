import { describe, expect, it } from 'vitest';
import type { UnmatchedRow } from '../../model/state';
import { digLinks, digQuery, digRows } from './digLinks';

function miss(
  artist: string,
  title: string,
  over: Partial<UnmatchedRow> = {}
): UnmatchedRow {
  return { artist, title, startSec: null, shazamUrl: null, ...over };
}

describe('digQuery', () => {
  it('drops the generic mix markers but keeps a remix name', () => {
    expect(
      digQuery('Chris Carrier & DJ W!ld', 'Pep A Cat Up (Original Mix)')
    ).toBe('Chris Carrier & DJ W!ld Pep A Cat Up');
    expect(digQuery('Chicago Transit Authority', 'Being There (Mixed)')).toBe(
      'Chicago Transit Authority Being There'
    );
    expect(digQuery('Barac', 'One Who Can See In The Dark (Remus Remix)')).toBe(
      'Barac One Who Can See In The Dark (Remus Remix)'
    );
  });

  it('collapses stray whitespace', () => {
    expect(digQuery('  Gemini ', 'Where Do I Go  - Original Mix')).toBe(
      'Gemini Where Do I Go'
    );
  });
});

describe('digLinks', () => {
  it('builds the five store and preview searches, in order', () => {
    const links = digLinks('Alegria', 'Chicachilla');
    expect(links.map((l) => l.site)).toEqual([
      'beatport',
      'bandcamp',
      'discogs',
      'soundcloud',
      'youtube',
    ]);
    expect(links.map((l) => l.href)).toEqual([
      'https://www.beatport.com/search/tracks?q=Alegria+Chicachilla',
      'https://bandcamp.com/search?q=Alegria+Chicachilla&item_type=t',
      'https://www.discogs.com/search/?q=Alegria+Chicachilla&type=all',
      'https://soundcloud.com/search/sounds?q=Alegria+Chicachilla',
      'https://www.youtube.com/results?search_query=Alegria+Chicachilla',
    ]);
  });

  it('percent-encodes the query', () => {
    const [beatport] = digLinks('Chris Carrier & DJ W!ld', 'Pep A Cat Up');
    expect(new URL(beatport.href).searchParams.get('q')).toBe(
      'Chris Carrier & DJ W!ld Pep A Cat Up'
    );
    expect(beatport.href).toContain('%26');
  });
});

describe('digRows', () => {
  it('lists a repeated track once, with every time it was played', () => {
    const rows = digRows([
      miss('Chris Carrier & DJ W!ld', 'Pep A Cat Up (Original Mix)', {
        startSec: 2890,
      }),
      miss('Russell G & Steve Haines', 'Double Six (Original mix)', {
        startSec: 3000,
      }),
      miss('Chris Carrier & DJ W!ld', 'Pep A Cat Up (Original Mix)', {
        startSec: 3750,
      }),
    ]);
    expect(rows.map((r) => [r.title, r.times])).toEqual([
      ['Pep A Cat Up (Original Mix)', [2890, 3750]],
      ['Double Six (Original mix)', [3000]],
    ]);
  });

  it('groups on the normalised name, keeping the first spelling', () => {
    const rows = digRows([
      miss('Gemini', 'Where Do I Go (1997 Mix)'),
      miss('GEMINI', 'Where do I go - 1997 Mix'),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Where Do I Go (1997 Mix)');
  });

  it('groups a title with and without a generic mix marker', () => {
    const rows = digRows([
      miss('Russell G', 'Double Six (Original mix)', { startSec: 10 }),
      miss('Russell G', 'Double Six', { startSec: 20 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].times).toEqual([10, 20]);
  });

  it('leaves out unknown times and keeps the first Shazam link', () => {
    const [row] = digRows([
      miss('Alegria', 'Chicachilla'),
      miss('Alegria', 'Chicachilla', {
        startSec: 6050,
        shazamUrl: 'https://www.shazam.com/track/20035855/chicachilla',
      }),
    ]);
    expect(row.times).toEqual([6050]);
    expect(row.shazamUrl).toBe(
      'https://www.shazam.com/track/20035855/chicachilla'
    );
    expect(row.links).toEqual(digLinks('Alegria', 'Chicachilla'));
  });

  it('is empty for no unmatched rows', () => {
    expect(digRows([])).toEqual([]);
  });
});
