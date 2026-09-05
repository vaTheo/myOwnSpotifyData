import { describe, expect, it } from 'vitest';
import {
  artistNames,
  artistUrl,
  formatBpm,
  formatDate,
  notCountedLine,
  plural,
} from './format';

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

  it('formats a day from an ISO string or an epoch', () => {
    // Noon UTC: the same calendar day in every zone the phone might use.
    const ms = Date.UTC(2026, 8, 15, 12, 0, 0);
    expect(formatDate(ms)).toBe(formatDate(new Date(ms).toISOString()));
    expect(formatDate(ms)).toContain('2026');
  });

  it('drops the zero categories from the not-counted line', () => {
    expect(
      notCountedLine({
        credited: 900,
        short: 22,
        podcast: 13,
        audiobook: 0,
        unattributed: 5,
        malformed: 0,
      })
    ).toBe('Not counted: 22 under 30 s, 13 podcast, 5 without a track id');
    expect(
      notCountedLine({
        credited: 900,
        short: 0,
        podcast: 0,
        audiobook: 0,
        unattributed: 0,
        malformed: 0,
      })
    ).toBeNull();
  });

  it('prints a BPM with one decimal and drops a trailing .0', () => {
    expect(formatBpm(124)).toBe('124');
    expect(formatBpm(127.5)).toBe('127.5');
    // ReccoBeats sends three decimals; rounding must not leave "128.0".
    expect(formatBpm(128.04)).toBe('128');
    expect(formatBpm(124.96)).toBe('125');
    expect(formatBpm(0)).toBe('0');
  });
});
