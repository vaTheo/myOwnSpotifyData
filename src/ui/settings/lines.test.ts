import { describe, expect, it } from 'vitest';
import type { ImportSummary } from '../../history/importer';
import { formatDate, historyLine } from '../format';
import {
  coverageLine,
  lookupDoneLine,
  pausedLine,
  pendingLine,
  pendingValue,
  reachCoverageLine,
  reachRunLine,
  rekordboxLine,
  usedShare,
  yearsLine,
} from './lines';

const summary: ImportSummary = {
  version: 2,
  importedAt: Date.UTC(2026, 9, 1),
  plays: 1200,
  tracks: 1,
  matchedTracks: 1,
  counts: { short: 0, podcast: 0, audiobook: 0, unattributed: 0, malformed: 0 },
  outcomes: { attempts: 0, finished: 0, skipped: 0 },
  zone: 'Europe/Paris',
  range: { first: '2019-01-02T10:00:00Z', last: '2026-09-30T10:00:00Z' },
  processed: [],
  skipped: [],
} as unknown as ImportSummary;

describe('Settings lines (word for word, FR-049)', () => {
  it('historyLine', () => {
    expect(historyLine(summary, 'Europe/Paris')).toBe(
      `Imported ${formatDate(summary.importedAt)}: 1,200 plays across 1 track. ` +
        `${formatDate('2019-01-02T10:00:00Z')} – ` +
        `${formatDate('2026-09-30T10:00:00Z')}. Months bucketed in Europe/Paris.`
    );
    expect(historyLine({ ...summary, range: null })).toBe(
      `Imported ${formatDate(summary.importedAt)}: 1,200 plays across 1 track.`
    );
  });

  it('yearsLine (round 005)', () => {
    expect(yearsLine(3120, 4980)).toBe('Release years: 3,120 of 4,980 tracks');
    expect(yearsLine(0, 1)).toBe('Release years: 0 of 1 track');
  });

  it('lookupDoneLine counts the years pass', () => {
    expect(lookupDoneLine({ found: 1200, notFound: 3, years: 40 })).toBe(
      'found 1,200 · not found 3 · years 40'
    );
  });

  it('coverageLine', () => {
    expect(
      coverageLine({
        total: 4980,
        covered: 3120,
        reccobeats: 2900,
        rekordbox: 1,
      })
    ).toBe(
      'BPM and key for 3,120 of 4,980 tracks · ReccoBeats 2,900 · Rekordbox 1'
    );
  });

  it('rekordboxLine', () => {
    expect(
      rekordboxLine({
        importedAt: 0,
        parsed: 1204,
        withBpm: 1190,
        withKey: 1050,
        matched: 820,
        unmatched: 384,
      })
    ).toBe(
      'parsed 1,204 · with BPM 1,190 · with key 1,050 · matched 820 · unmatched 384'
    );
  });

  it('reachCoverageLine', () => {
    expect(
      reachCoverageLine({
        artists: 1204,
        covered: 806,
        resolved: 1151,
        listenbrainz: 700,
        deezer: 790,
        wikipedia: 300,
        wellKnown: 280,
      })
    ).toBe(
      'Reach data for 806 of 1,204 artists · MusicBrainz 1,151 · ' +
        'ListenBrainz 700 · Deezer 790 · Wikipedia 300 · well known 280'
    );
  });

  it('reachRunLine', () => {
    expect(reachRunLine({ lookedUp: 1, written: 2, unresolved: 1500 })).toBe(
      'Looked up 1 artist · 2 new numbers · 1,500 unresolved'
    );
  });

  it('pausedLine', () => {
    expect(pausedLine('deezer')).toBe(
      'Deezer stopped answering after three tries; the rest of this run skipped it.'
    );
  });

  it('pendingValue and pendingLine (FR-050): a real 0, else the count and the names', () => {
    expect(pendingValue({})).toBe('0');
    expect(pendingLine({})).toBe('Changes waiting to send: 0');
    expect(pendingValue({ mixes: true, history: true })).toBe(
      '2 · Listening history, Mixes'
    );
    expect(pendingLine({ library: true })).toBe(
      'Changes waiting to send: 1 · Library'
    );
  });

  it('usedShare', () => {
    expect(usedShare(12.5 * 1024 * 1024, 500 * 1024 * 1024)).toBe(
      '12.5 MB of 500.0 MB used on the server'
    );
  });
});
