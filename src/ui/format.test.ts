import { describe, expect, it } from 'vitest';
import {
  artistNames,
  artistUrl,
  compactCount,
  formatBpm,
  formatClock,
  formatDate,
  notCountedLine,
  plural,
  profileLine,
  reachLine,
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

  it('builds a reach line from the parts that are known', () => {
    expect(reachLine(5896, 202216)).toBe(
      `${(5896).toLocaleString()} ListenBrainz listeners · ${(202216).toLocaleString()} Deezer fans`
    );
    expect(reachLine(54, null)).toBe('54 ListenBrainz listeners');
    expect(reachLine(null, 585)).toBe('585 Deezer fans');
    // A single listener is still one listener, and zero is a number.
    expect(reachLine(1, 0)).toBe('1 ListenBrainz listener · 0 Deezer fans');
    expect(reachLine(null, null)).toBe('no reach data');
  });

  it('builds a public-profile line and drops a missing view count', () => {
    expect(profileLine(19, 288783)).toBe(
      'Wikipedia · 19 languages · 289k views/yr'
    );
    // No pageviews row, or a zero one: the line keeps its language count.
    expect(profileLine(1, null)).toBe('Wikipedia · 1 language');
    expect(profileLine(3, 0)).toBe('Wikipedia · 3 languages');
    // No article at all: no line, the same threshold isWellKnown applies.
    expect(profileLine(0, 1200)).toBeNull();
    expect(profileLine(null, null)).toBeNull();
  });

  it('compacts a yearly view count at every boundary', () => {
    // Under 10,000 the exact figure is printed, in the device's own locale.
    expect(compactCount(999)).toBe((999).toLocaleString());
    expect(compactCount(9999)).toBe((9999).toLocaleString());
    expect(compactCount(10_000)).toBe('10k');
    expect(compactCount(288_783)).toBe('289k');
    // The k branch stops just short of printing "1000k".
    expect(compactCount(999_499)).toBe('999k');
    expect(compactCount(999_999)).toBe('1m');
    expect(compactCount(1_240_000)).toBe('1.2m');
  });

  it('formats a clock as m:ss under an hour and h:mm:ss at or above', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(44)).toBe('0:44');
    expect(formatClock(704)).toBe('11:44');
    expect(formatClock(3599)).toBe('59:59');
    // The hour boundary switches to h:mm:ss and zero-pads both tail groups.
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(11437)).toBe('3:10:37');
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
