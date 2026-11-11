import { describe, expect, it } from 'vitest';
import type { ItemLine } from './itemLines';
import {
  syncStatusRows,
  type StatusInputs,
  type StatusRow,
  type StatusSource,
} from './statusLines';

function inputs(over: Partial<StatusInputs> = {}): StatusInputs {
  return {
    spotify: {
      tone: 'ok',
      text: 'Synced Nov 11, 2026, 12:13 PM · next after Nov 12, 2026, 12:13 AM',
    },
    spotifyRetry: null,
    spotifyProgress: null,
    synced: true,
    features: {
      tone: 'ok',
      text: '22,353 / 33,888 tracks with BPM or key',
      retry: null,
    },
    coverage: { covered: 22353, total: 33888 },
    rekordboxImported: false,
    rekordboxRun: { status: 'idle' },
    reach: { tone: 'ok', text: 'Checked Nov 11, 2026', retry: null },
    reachCoverage: { covered: 3089, artists: 3755 },
    reachChecked: true,
    historyImported: true,
    historyRun: { status: 'idle' },
    server: { tone: 'ok', text: 'Up to date · last sync Nov 11, 2026' },
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

const running = {
  tone: 'running' as const,
  text: 'Running · 3 / 9',
  retry: null,
};

describe('syncStatusRows (spec 027)', () => {
  it('gives one line per source in a fixed order with its label', () => {
    expect(syncStatusRows(inputs()).map((r) => r.label)).toEqual([
      'Spotify',
      'BPM and key',
      'Rekordbox',
      'Artist reach',
      'Listening history',
      'Server',
    ]);
  });

  it('at rest, says the state only: no digit, no date (FR-001, SC-001)', () => {
    const rows = syncStatusRows(inputs());
    expect(rows.map((r) => [r.text, r.tone])).toEqual([
      ['Up to date', 'ok'],
      ['Up to date', 'ok'],
      ['Not imported', 'off'],
      ['Up to date', 'ok'],
      ['Imported', 'ok'],
      ['Up to date', 'ok'],
    ]);
    for (const r of rows) expect(r.text).not.toMatch(/\d/);
  });

  it('says Up to date for a partial coverage at rest (owner, US1.2)', () => {
    expect(row('features')).toMatchObject({ tone: 'ok', text: 'Up to date' });
    expect(row('reach')).toMatchObject({ tone: 'ok', text: 'Up to date' });
  });

  it('says in words what was never set up, imported or synced (US1.3)', () => {
    expect(row('spotify', { synced: false })).toMatchObject({
      tone: 'off',
      text: 'Never synced',
    });
    expect(row('features', { coverage: null }).text).toBe('No tracks yet');
    expect(row('features', { coverage: { covered: 0, total: 10 } }).text).toBe(
      'Not looked up'
    );
    expect(row('reach', { reachChecked: false }).text).toBe('Not looked up');
    expect(row('reach', { reachCoverage: null }).text).toBe('No artists yet');
    expect(row('history', { historyImported: false })).toMatchObject({
      tone: 'off',
      text: 'Not imported',
    });
    expect(row('rekordbox', { rekordboxImported: true })).toMatchObject({
      tone: 'ok',
      text: 'Imported',
    });
    expect(
      row('server', { server: { tone: 'off', text: 'Not set up' } }).text
    ).toBe('Not set up');
    expect(
      row('server', { server: { tone: 'off', text: 'Not signed in' } }).text
    ).toBe('Not signed in');
  });

  it('shows "N of M <unit>" only while a source runs (US2)', () => {
    expect(row('features', { features: running })).toMatchObject({
      tone: 'running',
      text: 'Updating · 22,353 of 33,888 tracks',
    });
    expect(row('reach', { reach: running })).toMatchObject({
      tone: 'running',
      text: 'Updating · 3,089 of 3,755 artists',
    });
    expect(
      row('history', { historyRun: { status: 'running', index: 1, total: 4 } })
    ).toMatchObject({ tone: 'running', text: 'Importing · 1 of 4 files' });
    expect(
      row('rekordbox', {
        rekordboxRun: { status: 'running', index: 2, total: 2 },
      }).text
    ).toBe('Importing · 2 of 2 files');
    expect(
      row('spotify', {
        spotify: { tone: 'running', text: 'Running · 3 / 141 playlists' },
        spotifyProgress: { done: 3, total: 141 },
      })
    ).toMatchObject({ tone: 'running', text: 'Syncing · 3 of 141 playlists' });
    expect(
      row('server', {
        server: { tone: 'running', text: 'Sending library · 3 / 9 rows' },
      })
    ).toMatchObject({ tone: 'running', text: 'Syncing' });
  });

  it('leaves a missing total out while running, never 0', () => {
    expect(
      row('spotify', {
        spotify: { tone: 'running', text: 'Running · 0 / 0 playlists' },
        spotifyProgress: { done: 0, total: 0 },
      }).text
    ).toBe('Syncing');
    expect(row('features', { features: running, coverage: null }).text).toBe(
      'Updating'
    );
    expect(row('reach', { reach: running, reachCoverage: null }).text).toBe(
      'Updating'
    );
    expect(
      row('history', { historyRun: { status: 'running', index: 0, total: 0 } })
        .text
    ).toBe('Importing');
  });

  it('says Failed with its Retry, without the message (US3.1)', () => {
    const failed: ItemLine = { tone: 'error', text: 'Failed · boom' };
    expect(
      row('spotify', { spotify: failed, spotifyRetry: 'spotify' })
    ).toMatchObject({ tone: 'error', text: 'Failed', retry: 'spotify' });
    expect(
      row('features', {
        features: { tone: 'failed', text: 'Failed · x', retry: 'features' },
      })
    ).toMatchObject({ tone: 'error', text: 'Failed', retry: 'features' });
    expect(
      row('reach', {
        reach: { tone: 'failed', text: 'Failed · x', retry: 'reach' },
      })
    ).toMatchObject({ tone: 'error', text: 'Failed', retry: 'reach' });
    expect(
      row('rekordbox', { rekordboxRun: { status: 'error', message: 'bad' } })
    ).toMatchObject({ tone: 'error', text: 'Failed', retry: null });
    expect(
      row('history', { historyRun: { status: 'error', message: 'bad' } })
    ).toMatchObject({ tone: 'error', text: 'Failed' });
    expect(
      row('server', { server: { tone: 'error', text: 'Failed · 500' } })
    ).toMatchObject({ tone: 'error', text: 'Failed', retry: null });
  });

  it('carries the Spotify Retry only on a failure', () => {
    expect(row('spotify', { spotifyRetry: 'spotify' }).retry).toBeNull();
  });

  it('says the lock-out without its time (US3.2)', () => {
    expect(
      row('spotify', {
        spotify: {
          tone: 'warning',
          text: 'Paused by Spotify until Nov 11, 2026, 3:00 PM',
        },
      })
    ).toMatchObject({ tone: 'warning', text: "Paused by Spotify's limit" });
  });

  it('says the server waiting, offline or paused in a word (US3.3)', () => {
    expect(
      row('server', {
        server: { tone: 'waiting', text: 'Waiting to send: library, mixes' },
      })
    ).toMatchObject({ tone: 'waiting', text: 'Changes to send' });
    expect(
      row('server', {
        server: {
          tone: 'warning',
          text: 'Offline · last sync Nov 11, 2026 · Waiting to send: mixes',
        },
      })
    ).toMatchObject({ tone: 'warning', text: 'Offline' });
    expect(
      row('server', {
        server: { tone: 'warning', text: 'Paused by the server' },
      }).text
    ).toBe('Paused');
    expect(
      row('server', { server: { tone: 'ok', text: 'Last sync Nov 11, 2026' } })
        .text
    ).toBe('Synced');
    expect(
      row('server', { server: { tone: 'off', text: 'Never synced' } }).text
    ).toBe('Never synced');
  });

  it('says Automatic updates off with the switch off, unless running or failed (US3.4)', () => {
    const off = { tone: 'off' as const, text: 'Off · …', retry: null };
    expect(row('features', { features: off })).toMatchObject({
      tone: 'off',
      text: 'Automatic updates off',
    });
    expect(row('reach', { reach: off }).text).toBe('Automatic updates off');
    expect(
      row('spotify', { spotify: { tone: 'off', text: 'Off · Synced …' } }).text
    ).toBe('Automatic updates off');
    expect(
      row('features', {
        features: { tone: 'waiting', text: 'Waiting', retry: null },
      })
    ).toMatchObject({ tone: 'waiting', text: 'Waiting' });
  });
});
