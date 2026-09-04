import { describe, expect, it } from 'vitest';
import { artistNames, artistUrl, plural } from './format';

describe('format helpers', () => {
  it('pluralises', () => {
    expect(plural(1, 'playlist')).toBe('1 playlist');
    expect(plural(0, 'track')).toBe('0 tracks');
    expect(plural(2500, 'play')).toBe(`${(2500).toLocaleString()} plays`);
  });

  it('joins artist names', () => {
    expect(
      artistNames([
        { id: 'a', name: 'Alpha' },
        { id: null, name: 'Beta' },
      ])
    ).toBe('Alpha, Beta');
    expect(artistNames([])).toBe('');
  });

  it('links artists by id and not local-file artists', () => {
    expect(artistUrl('4tZwfgrHOc3mvqYlEYSvVi')).toBe(
      'https://open.spotify.com/artist/4tZwfgrHOc3mvqYlEYSvVi'
    );
    expect(artistUrl(null)).toBeNull();
  });
});
