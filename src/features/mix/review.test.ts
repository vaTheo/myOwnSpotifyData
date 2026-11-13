import { describe, expect, it } from 'vitest';
import type { TracklistRow } from '../../db/schema';
import {
  inFilter,
  reviewChips,
  reviewLine,
  spotifyStatus,
  type ReviewFilter,
} from './review';

function row(over: Partial<TracklistRow> = {}): TracklistRow {
  return {
    startSec: 0,
    endSec: null,
    artist: 'A',
    title: 'T',
    label: null,
    source: 'tracklistify',
    gap: false,
    detected: { artist: 'A', title: 'T' },
    referenceCount: null,
    ...over,
  };
}

const FOUND = { id: 'abc', url: 'https://open.spotify.com/track/abc' };

const rows: TracklistRow[] = [
  row({ hits: 1, validated: true, spotify: FOUND, checkedAt: 1 }),
  row({ hits: 3, spotify: 'not-found', checkedAt: 1 }),
  row({ hits: 1 }),
  row({ origin: 'clue' }),
  row({ gap: true, artist: '', title: '' }),
  row({ validated: false, spotify: 'not-found', checkedAt: 2 }),
];

const ids = (f: ReviewFilter): number[] =>
  rows.map((r, i) => (inFilter(r, f) ? i : -1)).filter((i) => i >= 0);

describe('inFilter (T118, T127)', () => {
  it('All shows every row, gaps included', () => {
    expect(ids('all')).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('Not on Spotify is the tracks the check did not find', () => {
    expect(ids('notOnSpotify')).toEqual([1, 5]);
  });
  it('Heard once is the tracks matched by a single clip', () => {
    expect(ids('heardOnce')).toEqual([0, 2]);
  });
});

describe('reviewChips', () => {
  it('counts tracks, never gaps, and offers Heard once when a row has hits', () => {
    expect(reviewChips(rows)).toEqual([
      { filter: 'all', label: 'All (5)', count: 5 },
      { filter: 'notOnSpotify', label: 'Not on Spotify (2)', count: 2 },
      { filter: 'heardOnce', label: 'Heard once (2)', count: 2 },
    ]);
  });
  it('has no Heard once chip for a mix without clip counts', () => {
    const old = [row(), row({ gap: true })];
    expect(reviewChips(old).map((c) => c.filter)).toEqual([
      'all',
      'notOnSpotify',
    ]);
  });
});

describe('the Solid and Flagged chips (spec 029)', () => {
  const levelled: TracklistRow[] = [
    row({ evidence: 'solid', hits: 7 }),
    row({ evidence: 'once', hits: 1 }),
    row({ evidence: 'out_of_step', hits: 3 }),
    row({ evidence: 'candidates', hits: 1, candidates: 12 }),
    row({ evidence: 'inside', hits: 2 }),
    row({ hits: 4 }),
    row({ gap: true, artist: '', title: '', evidence: 'solid' }),
    row({ evidence: 'solid', hits: 2 }),
  ];
  const shown = (f: ReviewFilter): number[] =>
    levelled.map((r, i) => (inFilter(r, f) ? i : -1)).filter((i) => i >= 0);

  it('Solid is the solid rows; Flagged is out of step and many candidates', () => {
    expect(shown('solid')).toEqual([0, 7]);
    expect(shown('flagged')).toEqual([2, 3]);
  });

  it('a gap row shows under All only', () => {
    expect(shown('all')).toContain(6);
  });

  it('offers Solid and Flagged after Heard once, with counts, when a row has a known level', () => {
    expect(reviewChips(levelled)).toEqual([
      { filter: 'all', label: 'All (7)', count: 7 },
      { filter: 'notOnSpotify', label: 'Not on Spotify (0)', count: 0 },
      { filter: 'heardOnce', label: 'Heard once (2)', count: 2 },
      { filter: 'solid', label: 'Solid (2)', count: 2 },
      { filter: 'flagged', label: 'Flagged (2)', count: 2 },
    ]);
  });

  it('has neither chip when no row has a known level', () => {
    const old = [row({ hits: 2 }), row({ evidence: 'inside', hits: 1 })];
    expect(reviewChips(old).map((c) => c.filter)).toEqual([
      'all',
      'notOnSpotify',
      'heardOnce',
    ]);
    expect(reviewChips(rows).map((c) => c.filter)).not.toContain('solid');
  });
});

describe('spotifyStatus', () => {
  it('reads not checked, found and not found', () => {
    expect(spotifyStatus(row())).toBe('unchecked');
    expect(spotifyStatus(row({ spotify: FOUND }))).toBe('found');
    expect(spotifyStatus(row({ spotify: 'not-found' }))).toBe('notFound');
  });
});

describe('reviewLine', () => {
  it('reads "N tracks · M on Spotify · L not found", never a validated count', () => {
    expect(reviewLine(rows)).toBe('5 tracks · 1 on Spotify · 2 not found');
    expect(reviewLine([row()])).toBe('1 track · 0 on Spotify · 0 not found');
  });
});
