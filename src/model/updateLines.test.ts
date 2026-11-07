import { describe, expect, it } from 'vitest';
import type { ArtistReachSummary } from '../features/reachRun';
import type { ImportSummary } from '../history/importer';
import { formatDateTime } from '../ui/format';
import { AUTO_SYNC_AGE_MS } from './autoChain';
import { updateLines, type UpdateInputs, type UpdateJob } from './updateLines';

const T = 1_800_000_000_000;
const H = 60 * 60 * 1000;

function inputs(over: Partial<UpdateInputs> = {}): UpdateInputs {
  return {
    now: T,
    autoOn: true,
    chain: { current: null, waiting: [], failed: [] },
    server: {
      status: 'connected',
      lastSyncAt: T - H,
      usedBytes: null,
      stamps: [],
      rejected: 0,
    },
    sync: { status: 'idle' },
    lastSyncAt: T - 2 * H,
    lookup: { status: 'idle' },
    features: { covered: 120, total: 400 },
    reach: { status: 'idle' },
    reachSummary: null,
    history: null,
    rekordbox: null,
    ...over,
  };
}

function line(job: UpdateJob, over: Partial<UpdateInputs> = {}) {
  const found = updateLines(inputs(over)).find((l) => l.job === job);
  if (!found) throw new Error(`no ${job} line`);
  return { tone: found.tone, text: found.text, retry: found.retry };
}

describe('updateLines', () => {
  it('gives six lines in order with their labels', () => {
    expect(updateLines(inputs()).map((l) => [l.job, l.label])).toEqual([
      ['server', 'Server'],
      ['spotify', 'Spotify'],
      ['features', 'BPM and key'],
      ['reach', 'Artist reach'],
      ['history', 'History'],
      ['rekordbox', 'Rekordbox'],
    ]);
  });

  describe('server', () => {
    it('is up to date when connected', () => {
      expect(line('server')).toEqual({
        tone: 'ok',
        text: `Up to date · ${formatDateTime(T - H)}`,
        retry: null,
      });
    });
    it('says never when connected but never synced', () => {
      expect(
        line('server', {
          server: {
            status: 'connected',
            lastSyncAt: null,
            usedBytes: null,
            stamps: [],
            rejected: 0,
          },
        }).text
      ).toBe('Never');
    });
    it('shows a pull running', () => {
      expect(
        line('server', {
          server: { status: 'pulling', dataset: 'library', done: 1, total: 4 },
        })
      ).toEqual({ tone: 'running', text: 'Running · library', retry: null });
    });
    it.each([
      [{ status: 'offline', message: 'x' } as const, 'paused', 'Offline'],
      [
        { status: 'paused', dashboardUrl: 'u' } as const,
        'paused',
        'Paused by the server',
      ],
      [
        { status: 'error', message: 'boom' } as const,
        'failed',
        'Failed · boom',
      ],
      [{ status: 'signedOut' } as const, 'manual', 'Not signed in'],
      [{ status: 'unset' } as const, 'manual', 'Not set up'],
    ])('maps %o', (server, tone, text) => {
      expect(line('server', { server })).toEqual({ tone, text, retry: null });
    });
  });

  describe('spotify', () => {
    it('shows the last sync and the next automatic one', () => {
      expect(line('spotify')).toEqual({
        tone: 'ok',
        text: `Synced ${formatDateTime(T - 2 * H)} · next after ${formatDateTime(T - 2 * H + AUTO_SYNC_AGE_MS)}`,
        retry: null,
      });
    });
    it('shows no next time with the switch off', () => {
      expect(line('spotify', { autoOn: false })).toEqual({
        tone: 'off',
        text: `Off · Synced ${formatDateTime(T - 2 * H)}`,
        retry: null,
      });
    });
    it('says never when never synced', () => {
      expect(line('spotify', { lastSyncAt: null }).text).toBe('Never');
    });
    it('shows the progress while running', () => {
      expect(
        line('spotify', {
          sync: {
            status: 'running',
            done: 3,
            total: 12,
            current: 'x',
            pending: [],
          },
        })
      ).toEqual({
        tone: 'running',
        text: 'Running · 3 / 12 playlists',
        retry: null,
      });
    });
    it('is paused while Spotify locks the account', () => {
      expect(
        line('spotify', {
          sync: {
            status: 'locked',
            retryAt: T + H,
            pending: [],
            done: 0,
            total: 0,
          },
        })
      ).toEqual({
        tone: 'paused',
        text: `Paused by Spotify until ${formatDateTime(T + H)}`,
        retry: null,
      });
    });
    it('is not paused once the lock lapsed', () => {
      expect(
        line('spotify', {
          sync: {
            status: 'locked',
            retryAt: T - 1,
            pending: [],
            done: 0,
            total: 0,
          },
        }).tone
      ).toBe('ok');
    });
    it('is waiting when queued in the chain', () => {
      expect(
        line('spotify', {
          chain: { current: 'features', waiting: ['spotify'], failed: [] },
        })
      ).toEqual({ tone: 'waiting', text: 'Waiting', retry: null });
    });
    it('shows a failure with a retry', () => {
      expect(
        line('spotify', {
          sync: { status: 'error', message: 'Network down', pending: [] },
        })
      ).toEqual({
        tone: 'failed',
        text: 'Failed · Network down',
        retry: 'spotify',
      });
    });
  });

  describe('BPM and key', () => {
    it('shows the coverage when idle', () => {
      expect(line('features')).toEqual({
        tone: 'ok',
        text: '120 / 400 tracks with BPM or key',
        retry: null,
      });
    });
    it('never prints a missing coverage as zero', () => {
      expect(line('features', { features: null }).text).toBe('Never');
    });
    it('shows the progress while running', () => {
      expect(
        line('features', {
          lookup: { status: 'running', pass: 'by id', done: 132, total: 410 },
        })
      ).toEqual({
        tone: 'running',
        text: 'Running · 132 / 410 tracks',
        retry: null,
      });
    });
    it('shows a failure with a retry', () => {
      expect(
        line('features', { lookup: { status: 'error', message: 'busy' } })
      ).toEqual({ tone: 'failed', text: 'Failed · busy', retry: 'features' });
    });
    it('says off with the switch off', () => {
      expect(line('features', { autoOn: false })).toEqual({
        tone: 'off',
        text: 'Off · 120 / 400 tracks with BPM or key',
        retry: null,
      });
    });
    it('shows running even with the switch off', () => {
      expect(
        line('features', {
          autoOn: false,
          lookup: { status: 'running', pass: 'by id', done: 1, total: 2 },
        }).tone
      ).toBe('running');
    });
  });

  describe('Artist reach', () => {
    const summary = { ranAt: T - 3 * H } as ArtistReachSummary;
    it('shows the last run', () => {
      expect(line('reach', { reachSummary: summary })).toEqual({
        tone: 'ok',
        text: `Checked ${formatDateTime(T - 3 * H)}`,
        retry: null,
      });
    });
    it('says never without a run', () => {
      expect(line('reach').text).toBe('Never');
    });
    it('shows the progress while running', () => {
      expect(
        line('reach', {
          reach: {
            status: 'running',
            step: 'musicbrainz',
            done: 5,
            total: 80,
            paused: [],
          },
        }).text
      ).toBe('Running · 5 / 80 artists');
    });
    it('shows a failure with a retry', () => {
      expect(
        line('reach', {
          reach: { status: 'error', message: 'offline', paused: [] },
        })
      ).toEqual({ tone: 'failed', text: 'Failed · offline', retry: 'reach' });
    });
  });

  describe('imports', () => {
    it('history needs a file when never imported', () => {
      expect(line('history')).toEqual({
        tone: 'manual',
        text: 'Never · needs a file',
        retry: null,
      });
    });
    it('history shows its last import', () => {
      expect(
        line('history', {
          history: { importedAt: T - 24 * H } as ImportSummary,
        }).text
      ).toBe(`Imported ${formatDateTime(T - 24 * H)} · needs a new export`);
    });
    it('rekordbox needs a file when never imported', () => {
      expect(line('rekordbox').text).toBe('Never · needs a file');
    });
    it('rekordbox shows its last import', () => {
      expect(
        line('rekordbox', {
          rekordbox: {
            importedAt: T - H,
            parsed: 1,
            withBpm: 1,
            withKey: 1,
            matched: 1,
            unmatched: 0,
          },
        })
      ).toEqual({
        tone: 'manual',
        text: `Imported ${formatDateTime(T - H)} · needs a new XML`,
        retry: null,
      });
    });
  });
});
