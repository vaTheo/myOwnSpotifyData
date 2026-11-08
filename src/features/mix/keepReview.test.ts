import { describe, expect, it } from 'vitest';
import type { RemovedTrack, TracklistRow } from '../../db/schema';
import {
  REMOVED_MAX,
  mergeKeepingReview,
  recordRemoved,
  sameTrack,
} from './keepReview';

/** An untouched scan row, as `resultToRows` makes it. */
function scan(over: Partial<TracklistRow> = {}): TracklistRow {
  const artist = over.artist ?? 'Stefan Gubatz';
  const title = over.title ?? 'Noble Booth';
  return {
    startSec: 0,
    endSec: null,
    label: null,
    source: 'tracklistify',
    gap: false,
    referenceCount: null,
    confidence: 90,
    isrc: null,
    shazamUrl: null,
    ...over,
    artist,
    title,
    detected: over.detected ?? { artist, title },
  };
}

const FOUND = {
  spotify: { id: 'abc', url: 'https://open.spotify.com/track/abc' },
  checkedAt: 123,
} as const;

describe('sameTrack', () => {
  it('matches on ISRC, else on artist and title', () => {
    expect(
      sameTrack(
        { artist: 'X', title: 'One', isrc: 'GBAAA0000001' },
        { artist: 'Y', title: 'Two', isrc: 'gbaaa0000001' }
      )
    ).toBe(true);
    expect(
      sameTrack(
        { artist: 'DJ Koze', title: 'Pick Up' },
        { artist: 'Koze', title: 'Pick-Up (Original Mix)' }
      )
    ).toBe(true);
  });
  it('refuses another artist, a remix of the original, and unnamed rows', () => {
    expect(
      sameTrack(
        { artist: 'Four', title: 'Angel Echoes' },
        { artist: 'Four Tet', title: 'Angel Echoes' }
      )
    ).toBe(false);
    expect(
      sameTrack(
        { artist: 'Chris Lake', title: 'Losing It' },
        { artist: 'Chris Lake', title: 'Losing It (Ted Remix)' }
      )
    ).toBe(false);
    expect(
      sameTrack({ artist: 'ID', title: 'ID' }, { artist: 'ID', title: 'ID' })
    ).toBe(false);
    expect(
      sameTrack({ artist: '', title: '' }, { artist: '', title: '' })
    ).toBe(false);
  });
});

describe('mergeKeepingReview (T125, owner D1)', () => {
  it('accepted: same ISRC with a new title spelling keeps the review', () => {
    const existing = [
      scan({ isrc: 'DECH62001634', validated: true, ...FOUND }),
    ];
    const incoming = [
      scan({ title: 'Noble Booth (Extended)', isrc: 'DECH62001634' }),
    ];
    const out = mergeKeepingReview(existing, incoming, []);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      title: 'Noble Booth (Extended)',
      validated: true,
      ...FOUND,
    });
  });

  it('accepted: same artist and title at a new time keeps the review', () => {
    const existing = [scan({ startSec: 60, validated: true, ...FOUND })];
    const incoming = [scan({ startSec: 75, hits: 3 })];
    const out = mergeKeepingReview(existing, incoming, []);
    expect(out).toEqual([{ ...incoming[0], validated: true, ...FOUND }]);
  });

  it('keeps a year the row had when the new result dates it not; a new year wins (round 005)', () => {
    const dated = scan({ year: 1993, yearFrom: 'spotify' });
    const out = mergeKeepingReview([dated], [scan({ hits: 2 })], []);
    expect(out).toEqual([
      { ...scan({ hits: 2 }), year: 1993, yearFrom: 'spotify' },
    ]);
    const shazam = scan({ year: 1991, yearFrom: 'shazam' });
    expect(mergeKeepingReview([dated], [shazam], [])).toEqual([shazam]);
  });

  it('refused: the same title by another artist arrives To review', () => {
    const existing = [scan({ artist: 'Four', ...FOUND })];
    const incoming = [scan({ artist: 'Four Tet' })];
    const out = mergeKeepingReview(existing, incoming, []);
    expect(out).toEqual([incoming[0]]);
  });

  it('refused: a remix does not take its original’s review', () => {
    const existing = [scan({ title: 'Losing It', ...FOUND })];
    const incoming = [scan({ title: 'Losing It (Ted Remix)' })];
    const out = mergeKeepingReview(existing, incoming, []);
    expect(out).toEqual([incoming[0]]);
  });

  it('refused: a candidate does not take a heard row of another track', () => {
    // The same title by another artist: not the heard track.
    const existing = [
      scan({ artist: 'Four', title: 'Angel Echoes', hits: 4, ...FOUND }),
    ];
    const incoming = [
      scan({
        artist: 'Four Tet',
        title: 'Angel Echoes',
        origin: 'clue',
        confidence: null,
      }),
    ];
    const out = mergeKeepingReview(existing, incoming, []);
    expect(out).toEqual([incoming[0]]);
    expect(out[0].validated).toBeUndefined();
  });

  it('keeps edited, typed, pasted, TrackId and description rows, dropping incoming rows that match them', () => {
    const edited = scan({
      startSec: 10,
      title: 'Noble Booth (my edit)',
      source: 'manual',
      detected: { artist: 'Stefan Gubatz', title: 'Noble Booth' },
    });
    const typed: TracklistRow = {
      ...scan({ startSec: 20, artist: 'Mixxwave', title: 'Katerina' }),
      source: 'manual',
      detected: null,
    };
    const pasted = {
      ...scan({ startSec: 30, artist: 'P', title: 'Q' }),
      source: 'pasted' as const,
      detected: null,
    };
    const trackid = {
      ...scan({ startSec: 40, artist: 'R', title: 'S' }),
      source: 'trackid' as const,
    };
    const description = {
      ...scan({ startSec: 50, artist: 'U', title: 'V' }),
      source: 'description' as const,
      detected: null,
    };
    const incoming = [
      scan({ startSec: 11 }),
      scan({ startSec: 21, artist: 'Mixxwave', title: 'Katerina' }),
      scan({ startSec: 31, artist: 'P', title: 'Q' }),
      scan({ startSec: 41, artist: 'R', title: 'S' }),
      scan({ startSec: 51, artist: 'U', title: 'V' }),
      scan({ startSec: 61, artist: 'New', title: 'Track' }),
    ];
    const out = mergeKeepingReview(
      [edited, typed, pasted, trackid, description],
      incoming,
      []
    );
    expect(out).toEqual([
      edited,
      typed,
      pasted,
      trackid,
      description,
      incoming[5],
    ]);
  });

  it('drops an incoming row the owner removed', () => {
    const removed: RemovedTrack[] = [
      { artist: 'Stefan Gubatz', title: 'Noble Booth', isrc: null },
      { artist: 'Other', title: 'Thing', isrc: 'GBAAA0000001' },
    ];
    const incoming = [
      scan({ startSec: 5 }),
      scan({ startSec: 6, artist: 'X', title: 'Y', isrc: 'GBAAA0000001' }),
      scan({ startSec: 7, artist: 'Kept', title: 'New' }),
    ];
    expect(mergeKeepingReview([], incoming, removed)).toEqual([incoming[2]]);
  });

  it('keeps a validated scan row the new result misses, drops an unreviewed one, and replaces gaps', () => {
    const validated = scan({ startSec: 100, title: 'Kept', validated: true });
    const plain = scan({ startSec: 200, title: 'Gone' });
    const gap = scan({
      startSec: 300,
      artist: '',
      title: '',
      gap: true,
      detected: { artist: '', title: '' },
    });
    const newGap = { ...gap, startSec: 310 };
    const incoming = [scan({ startSec: 150, title: 'Fresh' }), newGap];
    expect(mergeKeepingReview([validated, plain, gap], incoming, [])).toEqual([
      validated,
      incoming[0],
      newGap,
    ]);
  });

  it('keeps the owner’s hand link: carried to the matching row, or the row kept when nothing matches (round 011)', () => {
    const LINKED = { ...FOUND, spotifyBy: 'owner' } as const;
    const carried = mergeKeepingReview(
      [scan({ startSec: 60, ...LINKED })],
      [scan({ startSec: 75, hits: 2 })],
      []
    );
    expect(carried).toEqual([
      { ...scan({ startSec: 75, hits: 2 }), ...LINKED },
    ]);
    const linked = scan({ startSec: 100, title: 'Linked', ...LINKED });
    const fresh = scan({ startSec: 150, title: 'Fresh' });
    expect(mergeKeepingReview([linked], [fresh], [])).toEqual([linked, fresh]);
  });

  it('hands one row’s review to one incoming row only (fix round 1, M8)', () => {
    const existing = [scan({ startSec: 60, validated: true, ...FOUND })];
    const incoming = [scan({ startSec: 60 }), scan({ startSec: 900 })];
    const out = mergeKeepingReview(existing, incoming, []);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ startSec: 60, validated: true, ...FOUND });
    expect(out[1]).toEqual(incoming[1]);
  });

  it('orders by time, rows without a time last', () => {
    const a = scan({ startSec: null, title: 'No time' });
    const b = scan({ startSec: 30, title: 'Thirty', validated: true });
    const c = scan({ startSec: 10, title: 'Ten' });
    expect(mergeKeepingReview([b], [a, c], []).map((r) => r.title)).toEqual([
      'Ten',
      'Thirty',
      'No time',
    ]);
  });
});

describe('recordRemoved (T125)', () => {
  it('records a deleted scan row by its detected text and ISRC', () => {
    const row = scan({ isrc: 'DECH62001634' });
    expect(recordRemoved(undefined, row)).toEqual([
      { artist: 'Stefan Gubatz', title: 'Noble Booth', isrc: 'DECH62001634' },
    ]);
  });
  it('ignores gaps and typed or pasted rows (nothing was detected)', () => {
    const gap = scan({ gap: true, artist: '', title: '' });
    const typed = { ...scan(), source: 'manual' as const, detected: null };
    const pasted = { ...scan(), source: 'pasted' as const, detected: null };
    expect(recordRemoved([], gap)).toEqual([]);
    expect(recordRemoved(undefined, typed)).toBeUndefined();
    expect(recordRemoved(undefined, pasted)).toBeUndefined();
  });
  it('records a corrected scan row by what was detected, so a later result leaves it out (fix round 1)', () => {
    const corrected = scan({
      title: 'Noble Booth (my edit)',
      source: 'manual',
      detected: { artist: 'Stefan Gubatz', title: 'Noble Booth' },
      isrc: 'DECH62001634',
    });
    const removed = recordRemoved(undefined, corrected);
    expect(removed).toEqual([
      { artist: 'Stefan Gubatz', title: 'Noble Booth', isrc: 'DECH62001634' },
    ]);
    const incoming = [scan({ startSec: 5 }), scan({ title: 'Other' })];
    expect(mergeKeepingReview([], incoming, removed ?? [])).toEqual([
      incoming[1],
    ]);
  });
  it('keeps the newest 500, dropping the oldest', () => {
    const full: RemovedTrack[] = Array.from(
      { length: REMOVED_MAX },
      (_, i) => ({
        artist: 'A',
        title: `T${i}`,
        isrc: null,
      })
    );
    const out = recordRemoved(full, scan({ title: 'Newest' }));
    expect(out).toHaveLength(REMOVED_MAX);
    expect(out?.[0].title).toBe('T1');
    expect(out?.[REMOVED_MAX - 1].title).toBe('Newest');
  });
});
