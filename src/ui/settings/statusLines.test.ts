import { describe, expect, it } from 'vitest';
import type { ImportSummary } from '../../history/importer';
import { formatDate } from '../format';
import type { ItemLine } from './itemLines';
import {
  serverRows,
  syncStatusRows,
  type StatusInputs,
  type StatusRow,
  type StatusSource,
} from './statusLines';

const T = 1_800_000_000_000;

function inputs(over: Partial<StatusInputs> = {}): StatusInputs {
  return {
    spotify: { tone: 'ok', text: 'Synced today' },
    spotifyRetry: null,
    library: { playlists: 48, tracks: 3199 },
    features: {
      tone: 'ok',
      text: '2,099 / 3,199 tracks with BPM or key',
      retry: null,
    },
    coverage: { covered: 2099, total: 3199 },
    dated: 3000,
    rekordbox: null,
    rekordboxRun: { status: 'idle' },
    reach: { tone: 'ok', text: 'Checked today', retry: null },
    reachCoverage: { covered: 806, artists: 1204 },
    history: null,
    historyRun: { status: 'idle' },
    server: { tone: 'off', text: 'Not set up' },
    stamps: null,
    ...over,
  };
}

function row(
  source: StatusSource,
  over: Partial<StatusInputs> = {}
): StatusRow {
  const found = syncStatusRows(inputs(over)).find((r) => r.source === source);
  if (!found) throw new Error(source);
  return found;
}

describe('syncStatusRows (FR-010)', () => {
  it('gives one line per source in a fixed order with its label', () => {
    expect(syncStatusRows(inputs()).map((r) => r.label)).toEqual([
      'Spotify → this device',
      'BPM and key (ReccoBeats)',
      'Rekordbox',
      'Artist reach',
      'Listening history',
      'This device ↔ server',
    ]);
  });

  it('counts what Spotify gave this device, then its state', () => {
    expect(row('spotify')).toMatchObject({
      tone: 'ok',
      text: '48 playlists · 3,199 tracks · Synced today',
      retry: null,
    });
  });

  it('carries the Spotify Retry only on a failure', () => {
    const failed: ItemLine = { tone: 'error', text: 'Failed · boom' };
    expect(
      row('spotify', { spotify: failed, spotifyRetry: 'spotify' })
    ).toMatchObject({
      tone: 'error',
      retry: 'spotify',
    });
  });

  it('never prints 0 for a library not synced yet', () => {
    expect(row('spotify', { library: null }).text).toBe('Synced today');
    expect(row('spotify', { library: { playlists: 0, tracks: 0 } }).text).toBe(
      'Synced today'
    );
  });

  it('counts BPM and key and release years; the job words only when not idle', () => {
    expect(row('features').text).toBe(
      '2,099 of 3,199 tracks · release years 3,000'
    );
    expect(
      row('features', {
        features: {
          tone: 'running',
          text: 'Running · 3 / 9 tracks',
          retry: null,
        },
      })
    ).toMatchObject({
      tone: 'running',
      text: '2,099 of 3,199 tracks · release years 3,000 · Running · 3 / 9 tracks',
    });
    expect(
      row('features', {
        features: { tone: 'failed', text: 'Failed · x', retry: 'features' },
      })
    ).toMatchObject({ tone: 'error', retry: 'features' });
    expect(
      row('features', {
        features: { tone: 'off', text: 'Off · …', retry: null },
      }).text
    ).toMatch(/· Automatic updates off$/);
    expect(row('features', { coverage: null, dated: null }).text).toBe(
      'No tracks yet'
    );
  });

  it('says Rekordbox matched and when, or Not imported', () => {
    expect(row('rekordbox')).toMatchObject({
      tone: 'off',
      text: 'Not imported',
    });
    const summary = {
      importedAt: T,
      parsed: 2,
      withBpm: 2,
      withKey: 2,
      matched: 1,
      unmatched: 1,
    };
    expect(row('rekordbox', { rekordbox: summary })).toMatchObject({
      tone: 'ok',
      text: `1 matched · imported ${formatDate(T)}`,
    });
    expect(
      row('rekordbox', { rekordboxRun: { status: 'error', message: 'bad' } })
    ).toMatchObject({ tone: 'error', text: 'Failed · bad' });
    expect(
      row('rekordbox', {
        rekordboxRun: { status: 'running', index: 1, total: 2 },
      }).tone
    ).toBe('running');
  });

  it('counts artists with reach, then the job words', () => {
    expect(row('reach').text).toBe('806 of 1,204 artists · Checked today');
    expect(row('reach', { reachCoverage: null }).text).toBe(
      'No artists yet · Checked today'
    );
  });

  it('counts plays from the history import', () => {
    expect(row('history')).toMatchObject({ tone: 'off', text: 'Not imported' });
    const summary = { importedAt: T, plays: 12000 } as ImportSummary;
    expect(row('history', { history: summary }).text).toBe(
      `12,000 plays · imported ${formatDate(T)}`
    );
    expect(
      row('history', { historyRun: { status: 'running', index: 1, total: 4 } })
        .tone
    ).toBe('running');
  });

  it('adds the server rows per data set to the server state', () => {
    const stamps = [
      { name: 'library', localAt: T, serverAt: T, rows: 3199 },
      { name: 'history', localAt: null, serverAt: null, rows: null },
      { name: 'mixes', localAt: T, serverAt: T, rows: 0 },
    ];
    expect(
      row('server', { server: { tone: 'ok', text: 'Up to date' }, stamps }).text
    ).toBe('Up to date · on the server: library 3,199 · mixes 0');
    expect(row('server').text).toBe('Not set up');
  });

  it('leaves out a data set with no row count', () => {
    expect(serverRows(null)).toBeNull();
    expect(
      serverRows([{ name: 'reach', localAt: null, serverAt: null, rows: null }])
    ).toBeNull();
  });
});
