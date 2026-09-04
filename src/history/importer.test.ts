import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getAllRows, getMeta, replacePlays, wipeDb } from '../db/repo';
import { runImport, type ImportState } from './importer';
import type { ImportMessage } from './process';
import { emptyCounts } from './records';

class FakeWorker {
  onmessage: ((event: MessageEvent<ImportMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  constructor(private readonly script: ImportMessage[] | Error) {}
  postMessage() {
    queueMicrotask(() => {
      if (this.script instanceof Error) {
        this.onerror?.({ message: this.script.message } as ErrorEvent);
        return;
      }
      for (const m of this.script) {
        this.onmessage?.({ data: m } as MessageEvent<ImportMessage>);
      }
    });
  }
  terminate() {
    this.terminated = true;
  }
}

const play = (trackId: string) => ({
  trackId,
  plays: 3,
  msPlayed: 90000,
  firstTs: '2020-01-01T00:00:00Z',
  lastTs: '2021-01-01T00:00:00Z',
  trackName: 'S',
  artistName: 'A',
  months: { '2020-01': 2, '2021-01': 1 },
  attempts: 4,
  finished: 3,
  skipped: 1,
});

const shortOnly = (trackId: string) => ({
  trackId,
  plays: 0,
  msPlayed: 0,
  firstTs: '',
  lastTs: '',
  trackName: 'S',
  artistName: 'A',
  months: {},
  attempts: 4,
  finished: 0,
  skipped: 4,
});

beforeEach(async () => {
  await wipeDb();
});

describe('runImport', () => {
  it('stores plays and a summary on done', async () => {
    const states: ImportState[] = [];
    const worker = new FakeWorker([
      { type: 'progress', file: 'f0', index: 0, total: 2 },
      {
        type: 'done',
        plays: [play('a'), play('b')],
        counts: { ...emptyCounts(), credited: 6 },
        outcomes: { attempts: 8, finished: 6, skipped: 2 },
        zone: 'Europe/Paris',
        range: { first: '2020-01-01T00:00:00Z', last: '2021-01-01T00:00:00Z' },
        processed: ['f0', 'f1'],
        skipped: [],
      },
    ]);
    await runImport([], {
      createWorker: () => worker as unknown as Worker,
      knownTrackIds: new Set(['a']),
      now: () => 77,
      onState: (s) => states.push(s),
    });
    expect(states[0]).toMatchObject({ status: 'running' });
    expect(states.at(-1)).toEqual({
      status: 'done',
      summary: {
        version: 2,
        importedAt: 77,
        plays: 6,
        tracks: 2,
        matchedTracks: 1,
        counts: { ...emptyCounts(), credited: 6 },
        outcomes: { attempts: 8, finished: 6, skipped: 2 },
        zone: 'Europe/Paris',
        range: { first: '2020-01-01T00:00:00Z', last: '2021-01-01T00:00:00Z' },
        processed: ['f0', 'f1'],
        skipped: [],
      },
    });
    expect((await getAllRows()).plays.map((p) => p.trackId)).toEqual([
      'a',
      'b',
    ]);
    await expect(getMeta('historySummary')).resolves.toMatchObject({
      plays: 6,
    });
    expect(worker.terminated).toBe(true);
  });

  it('reports worker errors and crashes', async () => {
    const errored: ImportState[] = [];
    await runImport([], {
      createWorker: () =>
        new FakeWorker([
          { type: 'error', code: 'no-files', message: 'nothing' },
        ]) as unknown as Worker,
      knownTrackIds: new Set(),
      now: () => 1,
      onState: (s) => errored.push(s),
    });
    expect(errored.at(-1)).toEqual({ status: 'error', message: 'nothing' });

    const crashed: ImportState[] = [];
    await runImport([], {
      createWorker: () =>
        new FakeWorker(new Error('boom')) as unknown as Worker,
      knownTrackIds: new Set(),
      now: () => 1,
      onState: (s) => crashed.push(s),
    });
    expect(crashed.at(-1)).toEqual({ status: 'error', message: 'boom' });
  });

  it('keeps the previous history when every file was skipped', async () => {
    await replacePlays([play('kept')]);
    const states: ImportState[] = [];
    await runImport([], {
      createWorker: () =>
        new FakeWorker([
          {
            type: 'done',
            plays: [],
            counts: emptyCounts(),
            outcomes: { attempts: 0, finished: 0, skipped: 0 },
            zone: 'Europe/Paris',
            range: null,
            processed: [],
            skipped: [
              {
                name: 'Streaming_History_Audio_2021_1.json',
                reason: 'unreadable: Unexpected end of JSON input',
              },
              {
                name: 'Streaming_History_Audio_2022_1.json',
                reason: 'not a JSON array',
              },
            ],
          },
        ]) as unknown as Worker,
      knownTrackIds: new Set(),
      now: () => 1,
      onState: (s) => states.push(s),
    });
    const last = states.at(-1);
    expect(last?.status).toBe('error');
    expect(last?.status === 'error' && last.message).toBe(
      'No file could be read: Streaming_History_Audio_2021_1.json (unreadable: Unexpected end of JSON input), Streaming_History_Audio_2022_1.json (not a JSON array)'
    );
    expect((await getAllRows()).plays.map((p) => p.trackId)).toEqual(['kept']);
    await expect(getMeta('historySummary')).resolves.toBeUndefined();
  });

  it('reports a worker that cannot be created', async () => {
    const states: ImportState[] = [];
    await runImport([], {
      createWorker: () => {
        throw new Error('Worker is not defined');
      },
      knownTrackIds: new Set(),
      now: () => 1,
      onState: (s) => states.push(s),
    });
    expect(states.at(-1)).toEqual({
      status: 'error',
      message: 'Could not start the import worker: Worker is not defined',
    });
  });

  it('counts only tracks with a credited play', async () => {
    const states: ImportState[] = [];
    await runImport([], {
      createWorker: () =>
        new FakeWorker([
          {
            type: 'done',
            plays: [play('a'), shortOnly('b')],
            counts: { ...emptyCounts(), credited: 3, short: 4 },
            outcomes: { attempts: 8, finished: 3, skipped: 5 },
            zone: 'America/New_York',
            range: {
              first: '2020-01-01T00:00:00Z',
              last: '2021-01-01T00:00:00Z',
            },
            processed: ['f0'],
            skipped: [],
          },
        ]) as unknown as Worker,
      knownTrackIds: new Set(['a', 'b']),
      now: () => 5,
      onState: (s) => states.push(s),
    });
    const last = states.at(-1);
    if (last?.status !== 'done') throw new Error('expected done');
    expect(last.summary.version).toBe(2);
    expect(last.summary.tracks).toBe(1);
    expect(last.summary.matchedTracks).toBe(1);
    expect(last.summary.zone).toBe('America/New_York');
    expect(last.summary.outcomes).toEqual({
      attempts: 8,
      finished: 3,
      skipped: 5,
    });
    // The skipped-only row is still stored: the finish-rate view needs it.
    expect((await getAllRows()).plays.map((p) => p.trackId)).toEqual([
      'a',
      'b',
    ]);
  });
});
