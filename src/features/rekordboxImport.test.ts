import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getFeatures, getMeta, putFeatures, wipeDb } from '../db/repo';
import type { FeatureRow } from '../db/schema';
import type { RbTrack, RekordboxMessage } from './rekordbox';
import type { LibraryTrack } from './rekordbox-match';
import { runRekordboxImport, type RekordboxState } from './rekordboxImport';

class FakeWorker {
  onmessage: ((event: MessageEvent<RekordboxMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  constructor(private readonly script: RekordboxMessage[] | Error) {}
  postMessage() {
    queueMicrotask(() => {
      if (this.script instanceof Error) {
        this.onerror?.({ message: this.script.message } as ErrorEvent);
        return;
      }
      for (const m of this.script) {
        this.onmessage?.({ data: m } as MessageEvent<RekordboxMessage>);
      }
    });
  }
  terminate() {
    this.terminated = true;
  }
}

const FILE = new File(['<DJ_PLAYLISTS/>'], 'collection.xml');

function lib(
  id: string,
  name: string,
  artists: string[],
  durationMs: number
): LibraryTrack {
  return { id, name, artists, durationMs };
}

const strobe: RbTrack = {
  title: 'Strobe',
  artist: 'deadmau5',
  bpm: 128,
  key: { key: 9, major: false },
  seconds: 638,
};

const voodoo: RbTrack = {
  title: 'Voodoo Ray',
  artist: 'A Guy Called Gerald',
  bpm: null,
  key: null,
  seconds: 400,
};

const LIBRARY = [
  lib('a', 'Strobe', ['deadmau5'], 638000),
  lib('b', 'Voodoo Ray', ['A Guy Called Gerald'], 400000),
];

/** 'a' has a ReccoBeats value to keep, 'z' is never matched by this import. */
const EXISTING: FeatureRow[] = [
  {
    trackId: 'a',
    isrc: 'GBAAA1000001',
    reccobeats: { bpm: 120, key: 0, major: true, energy: 0.8, fetchedAt: 10 },
    updatedAt: 10,
  },
  {
    trackId: 'z',
    isrc: null,
    reccobeats: { notFound: true, checkedAt: 11 },
    updatedAt: 11,
  },
];

async function rows(): Promise<FeatureRow[]> {
  return (await getFeatures()).sort((x, y) =>
    x.trackId.localeCompare(y.trackId)
  );
}

beforeEach(async () => {
  await wipeDb();
});

describe('runRekordboxImport', () => {
  it('merges values in, keeps ReccoBeats and stores the summary', async () => {
    await putFeatures(EXISTING);
    const states: RekordboxState[] = [];
    const worker = new FakeWorker([
      { type: 'parsed', tracks: [strobe, voodoo] },
    ]);
    await runRekordboxImport(FILE, {
      createWorker: () => worker as unknown as Worker,
      library: LIBRARY,
      existing: EXISTING,
      now: () => 77,
      onState: (s) => states.push(s),
    });
    expect(states[0]).toEqual({
      status: 'running',
      file: 'collection.xml',
      index: 0,
      total: 1,
    });
    expect(states.at(-1)).toEqual({
      status: 'done',
      summary: {
        importedAt: 77,
        parsed: 2,
        withBpm: 1,
        withKey: 1,
        matched: 2,
        unmatched: 0,
      },
    });
    expect(await rows()).toEqual([
      {
        trackId: 'a',
        isrc: 'GBAAA1000001',
        reccobeats: {
          bpm: 120,
          key: 0,
          major: true,
          energy: 0.8,
          fetchedAt: 10,
        },
        rekordbox: {
          bpm: 128,
          key: 9,
          major: false,
          energy: null,
          fetchedAt: 77,
          matchedBy: 'title-artist',
          rbTitle: 'Strobe',
          rbArtist: 'deadmau5',
        },
        updatedAt: 77,
      },
      {
        trackId: 'b',
        isrc: null,
        rekordbox: {
          bpm: null,
          key: null,
          major: null,
          energy: null,
          fetchedAt: 77,
          matchedBy: 'title-artist',
          rbTitle: 'Voodoo Ray',
          rbArtist: 'A Guy Called Gerald',
        },
        updatedAt: 77,
      },
      // Untouched: putFeatures upserts, it never clears the store.
      {
        trackId: 'z',
        isrc: null,
        reccobeats: { notFound: true, checkedAt: 11 },
        updatedAt: 11,
      },
    ]);
    await expect(getMeta('rekordboxSummary')).resolves.toMatchObject({
      matched: 2,
    });
    expect(worker.terminated).toBe(true);
  });

  it('counts the tracks it could not match', async () => {
    const states: RekordboxState[] = [];
    await runRekordboxImport(FILE, {
      createWorker: () =>
        new FakeWorker([
          {
            type: 'parsed',
            tracks: [
              strobe,
              { ...strobe, title: 'Nothing Like It', artist: 'Nobody At All' },
            ],
          },
        ]) as unknown as Worker,
      library: LIBRARY,
      existing: [],
      now: () => 5,
      onState: (s) => states.push(s),
    });
    expect(states.at(-1)).toEqual({
      status: 'done',
      summary: {
        importedAt: 5,
        parsed: 2,
        withBpm: 2,
        withKey: 2,
        matched: 1,
        unmatched: 1,
      },
    });
    expect((await rows()).map((r) => r.trackId)).toEqual(['a']);
  });

  it('reports worker errors and crashes without writing rows', async () => {
    const errored: RekordboxState[] = [];
    await runRekordboxImport(FILE, {
      createWorker: () =>
        new FakeWorker([
          { type: 'error', message: 'This is not a Rekordbox collection.' },
        ]) as unknown as Worker,
      library: LIBRARY,
      existing: [],
      now: () => 1,
      onState: (s) => errored.push(s),
    });
    expect(errored.at(-1)).toEqual({
      status: 'error',
      message: 'This is not a Rekordbox collection.',
    });

    const crashed: RekordboxState[] = [];
    await runRekordboxImport(FILE, {
      createWorker: () =>
        new FakeWorker(new Error('boom')) as unknown as Worker,
      library: LIBRARY,
      existing: [],
      now: () => 1,
      onState: (s) => crashed.push(s),
    });
    expect(crashed.at(-1)).toEqual({ status: 'error', message: 'boom' });
    expect(await rows()).toEqual([]);
    await expect(getMeta('rekordboxSummary')).resolves.toBeUndefined();
  });

  it('reports a worker that cannot be created', async () => {
    const states: RekordboxState[] = [];
    await runRekordboxImport(FILE, {
      createWorker: () => {
        throw new Error('Worker is not defined');
      },
      library: LIBRARY,
      existing: [],
      now: () => 1,
      onState: (s) => states.push(s),
    });
    expect(states.at(-1)).toEqual({
      status: 'error',
      message: 'Could not start the Rekordbox worker: Worker is not defined',
    });
  });
});
