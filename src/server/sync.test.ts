import { describe, expect, it, vi } from 'vitest';
import type { AllRows, MixRow, PlayRow, TrackRow } from '../db/schema';
import { ACCOUNT_MISMATCH_NOTICE } from '../sync/runner';
import type { Query, ServerClient, ServerResult } from './client';
import {
  cancelRequest,
  moveRequestToTop,
  readUsage,
  requestIdentify,
  stopRequest,
  runPull,
  runPush,
  runRemoveAll,
  type RepoLike,
  type SyncDeps,
} from './sync';
import {
  MIX_JOBS_META,
  SERVER_PENDING_META,
  type MixJobs,
  type ServerPending,
} from '../db/schema';
import type { ServerStatus } from './types';

/* ---------- an in-memory server: datasets, dataset_rows, mixes ---------- */

type Row = Record<string, unknown>;

const PK: Record<string, string[]> = {
  datasets: ['spotify_account_id', 'name'],
  dataset_rows: ['spotify_account_id', 'dataset', 'generation', 'store', 'key'],
  mixes: ['spotify_account_id', 'url'],
  jobs: ['id'],
};

function matches(row: Row, query: Query): boolean {
  for (const [k, v] of Object.entries(query)) {
    if (k === 'select' || k === 'order') continue;
    const [op, ...rest] = v.split('.');
    const value = rest.join('.');
    // `payload->>url` reads a JSON field, as PostgREST does.
    const arrow = k.indexOf('->>');
    const cell =
      arrow >= 0
        ? (row[k.slice(0, arrow)] as Record<string, unknown> | undefined)?.[
            k.slice(arrow + 3)
          ]
        : row[k];
    if (op === 'eq' && String(cell) !== value) return false;
    if (op === 'lt' && !(Number(cell) < Number(value))) return false;
    if (op === 'is' && value === 'null' && cell !== null && cell !== undefined)
      return false;
    if (op === 'in') {
      const list = value.replace(/^\(|\)$/g, '').split(',');
      if (!list.includes(String(cell))) return false;
    }
  }
  return true;
}

interface Fake {
  client: ServerClient;
  tables: Record<string, Row[]>;
  calls: string[];
  /** Make the n-th upsert of a table fail with this result. */
  failUpsert: { table: string; at: number; result: ServerResult<never> } | null;
  failSelect: ServerResult<never> | null;
}

function fakeServer(seed: Partial<Record<string, Row[]>> = {}): Fake {
  const tables: Record<string, Row[]> = {
    datasets: [],
    dataset_rows: [],
    mixes: [],
    jobs: [],
    ...seed,
  };
  const fake: Fake = {
    tables,
    calls: [],
    failUpsert: null,
    failSelect: null,
    client: null as unknown as ServerClient,
  };
  const upserts: Record<string, number> = {};
  fake.client = {
    requestLink: vi.fn(),
    exchangeCode: vi.fn(),
    refresh: vi.fn(),
    signOut: vi.fn(),
    async select<T>(
      table: string,
      query: Query,
      _token: string,
      range?: [number, number]
    ) {
      fake.calls.push(
        `select ${table} ${JSON.stringify(query)}${range ? ` ${range[0]}-${range[1]}` : ''}`
      );
      if (fake.failSelect) return fake.failSelect;
      let rows = tables[table].filter((r) => matches(r, query));
      if (query.order) {
        const keys = query.order.split(',');
        rows = [...rows].sort((a, b) => {
          for (const spec of keys) {
            const [k, dir] = spec.split('.');
            const x = String(a[k]);
            const y = String(b[k]);
            if (x !== y) return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1);
          }
          return 0;
        });
      }
      const total = rows.length;
      if (range) rows = rows.slice(range[0], range[1] + 1);
      return { ok: true as const, value: { rows: rows as T[], total } };
    },
    async upsert(table: string, rows: unknown[]) {
      fake.calls.push(`upsert ${table} ${rows.length}`);
      upserts[table] = (upserts[table] ?? 0) + 1;
      const f = fake.failUpsert;
      if (f && f.table === table && f.at === upserts[table]) return f.result;
      for (const incoming of rows as Row[]) {
        const pk = PK[table];
        const i = tables[table].findIndex((r) =>
          pk.every((k) => String(r[k]) === String(incoming[k]))
        );
        if (i >= 0) tables[table][i] = { ...tables[table][i], ...incoming };
        else tables[table].push({ ...incoming });
      }
      return { ok: true as const, value: undefined };
    },
    async remove(table: string, query: Query) {
      fake.calls.push(`remove ${table} ${JSON.stringify(query)}`);
      tables[table] = tables[table].filter((r) => !matches(r, query));
      return { ok: true as const, value: undefined };
    },
    async removeReturning<T>(table: string, query: Query) {
      fake.calls.push(`removeReturning ${table} ${JSON.stringify(query)}`);
      const gone = tables[table].filter((r) => matches(r, query));
      tables[table] = tables[table].filter((r) => !matches(r, query));
      return { ok: true as const, value: gone as T[] };
    },
    rpc: vi.fn(async () => ({ ok: true as const, value: 42 })),
    async insert(table: string, row: Row) {
      fake.calls.push(`insert ${table}`);
      const created = {
        id: `00000000-0000-4000-8000-${String(tables[table].length + 1).padStart(12, '0')}`,
        status: 'queued',
        claimed_by: null,
        claimed_at: null,
        finished_at: null,
        error: null,
        result: null,
        applied_at: null,
        created_at: new Date(5_000 + tables[table].length).toISOString(),
        ...row,
      };
      tables[table].push(created);
      return { ok: true as const, value: created };
    },
    async update(table: string, query: Query, patch: Row) {
      fake.calls.push(`update ${table} ${JSON.stringify(query)}`);
      const hit = tables[table].filter((r) => matches(r, query));
      for (const r of hit) Object.assign(r, patch);
      return { ok: true as const, value: hit };
    },
  } as unknown as ServerClient;
  return fake;
}

/* ---------- an in-memory repo ---------- */

function emptyRows(over: Partial<AllRows> = {}): AllRows {
  return {
    playlists: [],
    tracks: [],
    entries: [],
    topItems: [],
    plays: [],
    features: [],
    artistIdentity: [],
    artistReach: [],
    ...over,
  };
}

function fakeRepo(
  rows: AllRows,
  metas: Record<string, unknown>,
  mixes: MixRow[] = []
) {
  const state = {
    rows,
    metas: { ...metas },
    mixes: [...mixes],
    deleted: [] as { url: string; deletedAt: number }[],
  };
  const repo: RepoLike = {
    getAllRows: async () => state.rows,
    getMeta: async <T>(name: string) => state.metas[name] as T | undefined,
    putMeta: async (name, value) => {
      state.metas[name] = value;
    },
    deleteMeta: async (name) => {
      delete state.metas[name];
    },
    replaceDataset: vi.fn(async (stores, newRows, newMetas) => {
      for (const s of stores)
        (state.rows as unknown as Record<string, unknown[]>)[s] =
          newRows[s] ?? [];
      Object.assign(state.metas, newMetas);
    }),
    getMixes: async () => state.mixes,
    putMix: vi.fn(async (row: MixRow) => {
      const i = state.mixes.findIndex((m) => m.url === row.url);
      if (i >= 0) state.mixes[i] = row;
      else state.mixes.push(row);
    }),
    deleteMix: vi.fn(async (url: string) => {
      state.mixes = state.mixes.filter((m) => m.url !== url);
    }),
    getMixDeleted: async () => state.deleted,
    clearMixDeleted: vi.fn(async (urls: string[]) => {
      state.deleted = state.deleted.filter((d) => !urls.includes(d.url));
    }),
  };
  return { repo, state };
}

function track(key: string): TrackRow {
  return {
    key,
    id: key,
    uri: `spotify:track:${key}`,
    name: key,
    artists: [],
    album: '',
    durationMs: 1000,
    isrc: null,
    spotifyUrl: null,
    isLocal: false,
  };
}

function play(trackId: string): PlayRow {
  return {
    trackId,
    plays: 1,
    msPlayed: 1,
    firstTs: 'a',
    lastTs: 'b',
    trackName: null,
    artistName: null,
  };
}

function deps(
  fake: Fake,
  repo: RepoLike,
  over: Partial<SyncDeps> = {}
): { d: SyncDeps; states: ServerStatus[] } {
  const states: ServerStatus[] = [];
  const d: SyncDeps = {
    client: fake.client,
    token: async () => ({ ok: true, value: 'tok' }),
    repo,
    now: () => 5_000,
    onState: (s) => states.push(s),
    dbVersion: 4,
    ...over,
  };
  return { d, states };
}

const HISTORY = { version: 2, importedAt: 300, plays: 1, tracks: 1 };

/* ---------- runPush ---------- */

describe('runPush', () => {
  it('uploads a newer dataset in batches under a new generation, then the stamp, then drops the generation before the previous one', async () => {
    const fake = fakeServer({
      datasets: [
        {
          spotify_account_id: 'acc',
          name: 'history',
          fetched_at: 100,
          schema_version: 4,
          generation: 1,
          summary: null,
          row_count: 1,
        },
      ],
      dataset_rows: [
        {
          spotify_account_id: 'acc',
          dataset: 'history',
          store: 'plays',
          generation: 0,
          key: 'ancient',
          row: {},
        },
        {
          spotify_account_id: 'acc',
          dataset: 'history',
          store: 'plays',
          generation: 1,
          key: 'old',
          row: {},
        },
      ],
    });
    const plays = Array.from({ length: 1201 }, (_, i) => play(`t${i}`));
    const { repo, state } = fakeRepo(emptyRows({ plays }), {
      accountId: 'acc',
      historySummary: HISTORY,
      serverPending: { history: true },
    });
    const { d, states } = deps(fake, repo);
    const res = await runPush(d, ['history']);
    expect(res).toEqual({ ok: true, value: { pushed: ['history'] } });

    const uploads = fake.calls.filter((c) =>
      c.startsWith('upsert dataset_rows')
    );
    expect(uploads).toEqual([
      'upsert dataset_rows 500',
      'upsert dataset_rows 500',
      'upsert dataset_rows 201',
    ]);
    const order = fake.calls.filter((c) => !c.startsWith('select'));
    expect(order.slice(-2)).toEqual([
      'upsert datasets 1',
      'remove dataset_rows {"spotify_account_id":"eq.acc","dataset":"eq.history","generation":"lt.1"}',
    ]);
    const newRows = fake.tables.dataset_rows.filter(
      (r) => r.generation === 5_000
    );
    expect(newRows).toHaveLength(1201);
    expect(newRows[0]).toEqual({
      spotify_account_id: 'acc',
      dataset: 'history',
      store: 'plays',
      generation: 5_000,
      key: 't0',
      row: plays[0],
    });
    // Generation 1 (the previous one) survives; generation 0 is gone.
    expect(fake.tables.dataset_rows.some((r) => r.generation === 1)).toBe(true);
    expect(fake.tables.dataset_rows.some((r) => r.generation === 0)).toBe(
      false
    );
    expect(fake.tables.datasets[0]).toMatchObject({
      spotify_account_id: 'acc',
      name: 'history',
      fetched_at: 300,
      schema_version: 4,
      generation: 5_000,
      summary: HISTORY,
      row_count: 1201,
    });
    expect(state.metas.serverStamps).toEqual({
      history: { fetchedAt: 300, generation: 5_000, rows: 1201 },
    });
    expect(state.metas.serverPending).toEqual({});
    expect(state.metas.serverLastSync).toBe(5_000);
    const pushing = states.filter((s) => s.status === 'pushing');
    expect(pushing.length).toBeGreaterThanOrEqual(3);
    expect(pushing.at(-1)).toMatchObject({
      dataset: 'history',
      done: 1201,
      total: 1201,
    });
  });

  it('a first push (no server stamp) uploads and deletes nothing', async () => {
    const fake = fakeServer();
    const { repo } = fakeRepo(emptyRows({ tracks: [track('a')] }), {
      accountId: 'acc',
      lastSyncAt: 10,
    });
    const res = await runPush(deps(fake, repo).d, ['library']);
    expect(res).toEqual({ ok: true, value: { pushed: ['library'] } });
    expect(fake.calls.some((c) => c.startsWith('remove'))).toBe(false);
    expect(fake.tables.datasets[0]).toMatchObject({
      name: 'library',
      fetched_at: 10,
      summary: null,
      row_count: 1,
    });
  });

  it('a same or older local stamp uploads nothing and clears the pending flag', async () => {
    const fake = fakeServer({
      datasets: [
        {
          spotify_account_id: 'acc',
          name: 'library',
          fetched_at: 10,
          schema_version: 4,
          generation: 1,
          summary: null,
          row_count: 0,
        },
      ],
    });
    const { repo, state } = fakeRepo(emptyRows(), {
      accountId: 'acc',
      lastSyncAt: 10,
      serverPending: { library: true, history: true },
    });
    const res = await runPush(deps(fake, repo).d, ['library']);
    expect(res).toEqual({ ok: true, value: { pushed: [] } });
    expect(fake.calls.filter((c) => c.startsWith('upsert'))).toEqual([]);
    expect(state.metas.serverPending).toEqual({ history: true });
  });

  it('a failed batch stops the push, leaves the server stamp untouched and keeps the pending flag', async () => {
    const fake = fakeServer({
      datasets: [
        {
          spotify_account_id: 'acc',
          name: 'history',
          fetched_at: 100,
          schema_version: 4,
          generation: 1,
          summary: null,
          row_count: 1,
        },
      ],
    });
    fake.failUpsert = {
      table: 'dataset_rows',
      at: 2,
      result: { ok: false, kind: 'offline', message: 'gone' },
    };
    const plays = Array.from({ length: 700 }, (_, i) => play(`t${i}`));
    const { repo, state } = fakeRepo(emptyRows({ plays }), {
      accountId: 'acc',
      historySummary: HISTORY,
      serverPending: { history: true },
    });
    const res = await runPush(deps(fake, repo).d, ['history']);
    expect(res).toMatchObject({ ok: false, kind: 'offline' });
    expect(fake.tables.datasets[0]).toMatchObject({
      generation: 1,
      fetched_at: 100,
    });
    expect(state.metas.serverPending).toEqual({ history: true });
    expect(fake.calls.some((c) => c.startsWith('remove'))).toBe(false);
  });

  it('a tooLarge batch is returned as is, never retried', async () => {
    const fake = fakeServer();
    fake.failUpsert = {
      table: 'dataset_rows',
      at: 1,
      result: { ok: false, kind: 'tooLarge', message: 'big', status: 413 },
    };
    const { repo } = fakeRepo(emptyRows({ tracks: [track('a')] }), {
      accountId: 'acc',
      lastSyncAt: 10,
    });
    const res = await runPush(deps(fake, repo).d, ['library']);
    expect(res).toMatchObject({ ok: false, kind: 'tooLarge' });
    expect(
      fake.calls.filter((c) => c.startsWith('upsert dataset_rows'))
    ).toHaveLength(1);
  });

  it('without a local account id nothing is pushed', async () => {
    const fake = fakeServer();
    const { repo } = fakeRepo(emptyRows({ tracks: [track('a')] }), {
      lastSyncAt: 10,
    });
    const res = await runPush(deps(fake, repo).d, ['library']);
    expect(res).toEqual({
      ok: true,
      value: { pushed: [], skipped: 'noAccount' },
    });
    expect(fake.calls).toEqual([]);
  });

  it('a failed token is returned without touching the server', async () => {
    const fake = fakeServer();
    const { repo } = fakeRepo(emptyRows(), {
      accountId: 'acc',
      lastSyncAt: 10,
    });
    const res = await runPush(
      deps(fake, repo, {
        token: async () => ({ ok: false, kind: 'unauthorized', message: 'no' }),
      }).d,
      ['library']
    );
    expect(res).toMatchObject({ ok: false, kind: 'unauthorized' });
    expect(fake.calls).toEqual([]);
  });
});

/* ---------- both directions (US2) ---------- */

describe('newer wins in both directions', () => {
  it('an older local library is pulled, a newer one is pushed, an equal one is left alone', async () => {
    const stamp = (fetched: number) => ({
      spotify_account_id: 'acc',
      name: 'library',
      fetched_at: fetched,
      schema_version: 4,
      generation: 1,
      summary: null,
      row_count: 0,
    });
    const older = fakeRepo(emptyRows(), { accountId: 'acc', lastSyncAt: 5 });
    const olderServer = fakeServer({ datasets: [stamp(10)] });
    expect(await runPull(deps(olderServer, older.repo).d)).toMatchObject({
      ok: true,
      value: { pulled: ['library'] },
    });
    expect(
      await runPush(deps(olderServer, older.repo).d, ['library'])
    ).toMatchObject({ ok: true, value: { pushed: [] } });

    const newer = fakeRepo(emptyRows({ tracks: [track('x')] }), {
      accountId: 'acc',
      lastSyncAt: 20,
    });
    const newerServer = fakeServer({ datasets: [stamp(10)] });
    expect(await runPull(deps(newerServer, newer.repo).d)).toMatchObject({
      ok: true,
      value: { pulled: [] },
    });
    expect(
      await runPush(deps(newerServer, newer.repo).d, ['library'])
    ).toMatchObject({ ok: true, value: { pushed: ['library'] } });
    expect(newerServer.tables.datasets[0]).toMatchObject({ fetched_at: 20 });

    const equal = fakeRepo(emptyRows(), { accountId: 'acc', lastSyncAt: 10 });
    const equalServer = fakeServer({ datasets: [stamp(10)] });
    expect(await runPull(deps(equalServer, equal.repo).d)).toMatchObject({
      ok: true,
      value: { pulled: [] },
    });
    expect(
      await runPush(deps(equalServer, equal.repo).d, ['library'])
    ).toMatchObject({ ok: true, value: { pushed: [] } });
    expect(equal.repo.replaceDataset).not.toHaveBeenCalled();
  });
});

/* ---------- mixes (US2) ---------- */

function mix(url: string, savedAt: number, title = 'T'): MixRow {
  return {
    url,
    title,
    author: null,
    playerSrc: null,
    slug: null,
    sources: {
      trackid: false,
      description: false,
      pasted: true,
      linkOut: null,
    },
    rows: [],
    savedAt,
  };
}

function serverMix(
  url: string,
  savedAt: number,
  row: MixRow | null = mix(url, savedAt),
  deletedAt: number | null = null
): Row {
  return {
    spotify_account_id: 'acc',
    url,
    saved_at: savedAt,
    deleted_at: deletedAt,
    row,
  };
}

describe('mixes', () => {
  it('push: reads the stamps, uploads newer local rows and tombstones for local deletions, then clears them', async () => {
    const fake = fakeServer({
      mixes: [
        serverMix('kept', 10),
        serverMix('older-on-server', 5),
        serverMix('newer-on-server', 50),
      ],
    });
    const { repo, state } = fakeRepo(
      emptyRows(),
      { accountId: 'acc', serverPending: { mixes: true } },
      [
        mix('kept', 10),
        mix('older-on-server', 20),
        mix('newer-on-server', 20),
        mix('brand-new', 30),
      ]
    );
    state.deleted.push({ url: 'gone', deletedAt: 40 });
    const res = await runPush(deps(fake, repo).d, ['mixes']);
    expect(res).toEqual({ ok: true, value: { pushed: ['mixes'] } });
    expect(fake.calls[1]).toBe(
      'select mixes {"select":"url,saved_at,deleted_at","spotify_account_id":"eq.acc"}'
    );
    const byUrl = Object.fromEntries(
      fake.tables.mixes.map((m) => [m.url as string, m])
    );
    expect(byUrl['older-on-server']).toEqual({
      spotify_account_id: 'acc',
      url: 'older-on-server',
      saved_at: 20,
      deleted_at: null,
      row: mix('older-on-server', 20),
    });
    expect(byUrl['brand-new']).toMatchObject({
      saved_at: 30,
      deleted_at: null,
    });
    expect(byUrl['newer-on-server']).toMatchObject({ saved_at: 50 });
    expect(byUrl['gone']).toEqual({
      spotify_account_id: 'acc',
      url: 'gone',
      saved_at: 40,
      deleted_at: 40,
      row: null,
    });
    expect(repo.clearMixDeleted).toHaveBeenCalledWith(['gone']);
    expect(state.metas.serverPending).toEqual({});
  });

  it('pull: fetches the full rows once, keeps only what the plan asks, validates, deletes on a newer tombstone', async () => {
    const bad = {
      ...mix('bad', 60),
      playerSrc: 'https://evil.example/player/',
    };
    const fake = fakeServer({
      mixes: [
        serverMix(
          'newer-on-server',
          50,
          mix('newer-on-server', 50, 'edited elsewhere')
        ),
        serverMix('bad', 60, bad),
        serverMix('deleted-elsewhere', 10, null, 70),
        serverMix('same', 10),
        serverMix('fresh', 5),
      ],
    });
    const { repo, state } = fakeRepo(emptyRows(), { accountId: 'acc' }, [
      mix('newer-on-server', 20),
      mix('deleted-elsewhere', 30),
      mix('same', 10),
    ]);
    const res = await runPull(deps(fake, repo).d);
    expect(res).toEqual({
      ok: true,
      value: { pulled: ['mixes'], rejected: 1, stale: [] },
    });
    const fullReads = fake.calls.filter((c) =>
      c.startsWith('select mixes {"select":"*"')
    );
    expect(fullReads).toHaveLength(1);
    expect(fullReads[0]).not.toContain('url=in');
    expect(repo.putMix).toHaveBeenCalledTimes(2);
    expect(state.mixes.find((m) => m.url === 'newer-on-server')?.title).toBe(
      'edited elsewhere'
    );
    expect(state.mixes.some((m) => m.url === 'fresh')).toBe(true);
    expect(state.mixes.some((m) => m.url === 'bad')).toBe(false);
    expect(repo.deleteMix).toHaveBeenCalledWith('deleted-elsewhere', 70);
    expect(state.mixes.some((m) => m.url === 'deleted-elsewhere')).toBe(false);
  });

  it('a mix edited on both sides keeps the newer save whole', async () => {
    const fake = fakeServer({
      mixes: [serverMix('m', 100, mix('m', 100, 'server wins'))],
    });
    const { repo, state } = fakeRepo(emptyRows(), { accountId: 'acc' }, [
      mix('m', 90, 'local loses'),
    ]);
    await runPull(deps(fake, repo).d);
    expect(state.mixes[0].title).toBe('server wins');
    const fake2 = fakeServer({
      mixes: [serverMix('m', 90, mix('m', 90, 'server loses'))],
    });
    const local2 = fakeRepo(emptyRows(), { accountId: 'acc' }, [
      mix('m', 100, 'local wins'),
    ]);
    await runPush(deps(fake2, local2.repo).d, ['mixes']);
    expect((fake2.tables.mixes[0].row as MixRow).title).toBe('local wins');
    expect(fake2.tables.mixes[0].saved_at).toBe(100);
  });

  it('pull with nothing to do touches no mix', async () => {
    const fake = fakeServer({ mixes: [serverMix('same', 10)] });
    const { repo } = fakeRepo(emptyRows(), { accountId: 'acc' }, [
      mix('same', 10),
    ]);
    const res = await runPull(deps(fake, repo).d);
    expect(res).toMatchObject({ ok: true, value: { pulled: [] } });
    expect(repo.putMix).not.toHaveBeenCalled();
    expect(
      fake.calls.filter((c) => c.startsWith('select mixes {"select":"*"'))
    ).toHaveLength(0);
  });
});

/* ---------- offline, paused, pending (US3) ---------- */

describe('offline and paused', () => {
  it('a paused first request is passed through unchanged, repo untouched, flags kept', async () => {
    const fake = seededServer();
    fake.failSelect = {
      ok: false,
      kind: 'paused',
      message: 'The server project is paused.',
    };
    const { repo, state } = fakeRepo(emptyRows({ tracks: [track('a')] }), {
      accountId: 'acc',
      lastSyncAt: 10,
      serverPending: { library: true },
    });
    expect(await runPull(deps(fake, repo).d)).toEqual({
      ok: false,
      kind: 'paused',
      message: 'The server project is paused.',
    });
    expect(await runPush(deps(fake, repo).d, ['library'])).toEqual({
      ok: false,
      kind: 'paused',
      message: 'The server project is paused.',
    });
    expect(repo.replaceDataset).not.toHaveBeenCalled();
    expect(state.metas.serverPending).toEqual({ library: true });
  });

  it('runPush compares and pushes only the datasets it is given', async () => {
    const fake = fakeServer();
    const { repo, state } = fakeRepo(
      emptyRows({ tracks: [track('a')], plays: [play('p')] }),
      {
        accountId: 'acc',
        lastSyncAt: 10,
        historySummary: HISTORY,
        serverPending: { history: true },
      }
    );
    const res = await runPush(deps(fake, repo).d, ['history']);
    expect(res).toEqual({ ok: true, value: { pushed: ['history'] } });
    expect(fake.tables.datasets.map((d) => d.name)).toEqual(['history']);
    expect(state.metas.serverPending).toEqual({});
  });
});

/* ---------- remove all, usage (US4) ---------- */

describe('runRemoveAll and readUsage', () => {
  it('deletes the four tables in order and clears the local server metas', async () => {
    const fake = seededServer();
    fake.tables.mixes.push({
      spotify_account_id: 'acc',
      url: 'm',
      saved_at: 1,
      deleted_at: null,
      row: null,
    });
    fake.tables.jobs.push({
      id: 'j1',
      owner_id: 'o',
      kind: 'x',
      status: 'queued',
    });
    const { repo, state } = fakeRepo(emptyRows(), {
      accountId: 'acc',
      serverStamps: { history: { fetchedAt: 1, generation: 1, rows: 1 } },
      serverPending: { library: true },
      serverLastSync: 5,
      mixDeleted: [{ url: 'm', deletedAt: 1 }],
    });
    const res = await runRemoveAll(deps(fake, repo).d);
    expect(res).toEqual({ ok: true, value: undefined });
    expect(
      fake.calls
        .filter((c) => c.startsWith('remove'))
        .map((c) => c.split(' ')[1])
    ).toEqual(['dataset_rows', 'datasets', 'mixes', 'jobs']);
    expect(fake.tables.dataset_rows).toEqual([]);
    expect(fake.tables.datasets).toEqual([]);
    expect(fake.tables.mixes).toEqual([]);
    expect(fake.tables.jobs).toEqual([]);
    expect(state.metas.serverStamps).toBeUndefined();
    expect(state.metas.serverPending).toBeUndefined();
    expect(state.metas.serverLastSync).toBeUndefined();
    expect(state.metas.mixDeleted).toBeUndefined();
    // The Spotify account id and the local data stay.
    expect(state.metas.accountId).toBe('acc');
  });

  it("removes only the signed-in user's rows: the session's token, the owner filter alone (RLS, round 011 T016)", async () => {
    const fake = seededServer();
    const seen: [string, Record<string, string>, string][] = [];
    const remove = fake.client.remove;
    fake.client.remove = async (table, query, token) => {
      seen.push([table, query, token]);
      return remove(table, query, token);
    };
    const { repo } = fakeRepo(emptyRows(), { accountId: 'acc' });
    const res = await runRemoveAll(
      deps(fake, repo, { token: async () => ({ ok: true, value: 'user-b' }) }).d
    );
    expect(res.ok).toBe(true);
    // Every delete is the caller's: owner_id = auth.uid() (rules.test.ts)
    // picks the rows; no filter widens or narrows it to a Spotify account.
    expect(seen).toEqual(
      ['dataset_rows', 'datasets', 'mixes', 'jobs'].map((t) => [
        t,
        { owner_id: 'not.is.null' },
        'user-b',
      ])
    );
  });

  it('a failure on one table stops and names it; the metas are kept', async () => {
    const fake = seededServer();
    const failing = fake.client.remove;
    fake.client.remove = async (table, query, token) => {
      if (table === 'datasets')
        return { ok: false, kind: 'offline', message: 'down' };
      return failing(table, query, token);
    };
    const { repo, state } = fakeRepo(emptyRows(), {
      accountId: 'acc',
      serverLastSync: 5,
    });
    const res = await runRemoveAll(deps(fake, repo).d);
    expect(res).toMatchObject({ ok: false, kind: 'offline' });
    if (!res.ok) expect(res.message).toContain('datasets');
    expect(state.metas.serverLastSync).toBe(5);
  });

  it('readUsage posts to the storage_used function and returns the bytes', async () => {
    const fake = seededServer();
    const { repo } = fakeRepo(emptyRows(), { accountId: 'acc' });
    expect(await readUsage(deps(fake, repo).d)).toEqual({
      ok: true,
      value: 42,
    });
    expect(fake.client.rpc).toHaveBeenCalledWith('storage_used', 'tok');
  });
});

/* ---------- runPull ---------- */

function seededServer(account = 'acc') {
  return fakeServer({
    datasets: [
      {
        spotify_account_id: account,
        name: 'history',
        fetched_at: 300,
        schema_version: 4,
        generation: 7,
        summary: HISTORY,
        row_count: 2,
      },
      {
        spotify_account_id: account,
        name: 'library',
        fetched_at: 50,
        schema_version: 4,
        generation: 3,
        summary: null,
        row_count: 1,
      },
    ],
    dataset_rows: [
      {
        spotify_account_id: account,
        dataset: 'history',
        store: 'plays',
        generation: 7,
        key: 'p1',
        row: play('p1'),
      },
      {
        spotify_account_id: account,
        dataset: 'history',
        store: 'plays',
        generation: 7,
        key: 'p2',
        row: play('p2'),
      },
      {
        spotify_account_id: account,
        dataset: 'history',
        store: 'plays',
        generation: 6,
        key: 'stale',
        row: play('stale'),
      },
      {
        spotify_account_id: account,
        dataset: 'library',
        store: 'tracks',
        generation: 3,
        key: 't1',
        row: track('t1'),
      },
    ],
  });
}

describe('runPull', () => {
  it('pulls every dataset the server holds newer, rows and summary together, and records the stamps', async () => {
    const fake = seededServer();
    const { repo, state } = fakeRepo(emptyRows(), { accountId: 'acc' });
    const { d, states } = deps(fake, repo);
    const res = await runPull(d);
    expect(res).toEqual({
      ok: true,
      value: { pulled: ['library', 'history'], rejected: 0, stale: [] },
    });
    expect(repo.replaceDataset).toHaveBeenCalledWith(
      ['plays'],
      { plays: [play('p1'), play('p2')] },
      { historySummary: HISTORY }
    );
    expect(repo.replaceDataset).toHaveBeenCalledWith(
      ['playlists', 'tracks', 'entries', 'topItems'],
      { playlists: [], tracks: [track('t1')], entries: [], topItems: [] },
      { lastSyncAt: 50 }
    );
    expect(state.metas.serverStamps).toEqual({
      history: { fetchedAt: 300, generation: 7, rows: 2 },
      library: { fetchedAt: 50, generation: 3, rows: 1 },
    });
    expect(state.metas.serverLastSync).toBe(5_000);
    // Only the stamp's generation is read, never the stale one.
    const reads = fake.calls.filter((c) => c.startsWith('select dataset_rows'));
    expect(
      reads.every(
        (c) =>
          c.includes('"generation":"eq.7"') || c.includes('"generation":"eq.3"')
      )
    ).toBe(true);
    expect(
      states.some((s) => s.status === 'pulling' && s.dataset === 'history')
    ).toBe(true);
    // No Spotify host was ever called.
    expect(
      fake.calls.every(
        (c) => !c.includes('api.spotify.com') && !c.includes('/me')
      )
    ).toBe(true);
  });

  it('pages the rows with Range until the total is reached', async () => {
    const rows = Array.from({ length: 2_500 }, (_, i) => ({
      spotify_account_id: 'acc',
      dataset: 'history',
      store: 'plays',
      generation: 1,
      key: `k${String(i).padStart(5, '0')}`,
      row: play(`k${i}`),
    }));
    const fake = fakeServer({
      datasets: [
        {
          spotify_account_id: 'acc',
          name: 'history',
          fetched_at: 300,
          schema_version: 4,
          generation: 1,
          summary: HISTORY,
          row_count: 2_500,
        },
      ],
      dataset_rows: rows,
    });
    const { repo } = fakeRepo(emptyRows(), { accountId: 'acc' });
    const res = await runPull(deps(fake, repo).d);
    expect(res).toMatchObject({ ok: true, value: { pulled: ['history'] } });
    const pages = fake.calls.filter((c) => c.startsWith('select dataset_rows'));
    expect(pages.map((c) => c.split(' ').at(-1))).toEqual([
      '0-999',
      '1000-1999',
      '2000-2999',
    ]);
    const call = (repo.replaceDataset as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(call[1].plays).toHaveLength(2_500);
  });

  it('skips a dataset whose local stamp is equal or newer', async () => {
    const fake = seededServer();
    const { repo } = fakeRepo(emptyRows(), {
      accountId: 'acc',
      historySummary: { ...HISTORY, importedAt: 300 },
      lastSyncAt: 99,
    });
    const res = await runPull(deps(fake, repo).d);
    expect(res).toMatchObject({ ok: true, value: { pulled: [] } });
    expect(repo.replaceDataset).not.toHaveBeenCalled();
  });

  it('drops and counts rows the safety check rejects; refuses a dataset whose summary is wrong', async () => {
    const fake = fakeServer({
      datasets: [
        {
          spotify_account_id: 'acc',
          name: 'library',
          fetched_at: 50,
          schema_version: 4,
          generation: 3,
          summary: null,
          row_count: 2,
        },
        {
          spotify_account_id: 'acc',
          name: 'history',
          fetched_at: 300,
          schema_version: 4,
          generation: 7,
          summary: { importedAt: 300 },
          row_count: 1,
        },
      ],
      dataset_rows: [
        {
          spotify_account_id: 'acc',
          dataset: 'library',
          store: 'tracks',
          generation: 3,
          key: 'ok',
          row: track('ok'),
        },
        {
          spotify_account_id: 'acc',
          dataset: 'library',
          store: 'tracks',
          generation: 3,
          key: 'bad',
          row: { ...track('bad'), spotifyUrl: 'javascript:alert(1)' },
        },
        {
          spotify_account_id: 'acc',
          dataset: 'history',
          store: 'plays',
          generation: 7,
          key: 'p',
          row: play('p'),
        },
      ],
    });
    const { repo } = fakeRepo(emptyRows(), { accountId: 'acc' });
    const res = await runPull(deps(fake, repo).d);
    expect(res).toEqual({
      ok: true,
      value: {
        pulled: ['library'],
        rejected: 1,
        stale: [],
        refused: ['history'],
      },
    });
    expect(repo.replaceDataset).toHaveBeenCalledTimes(1);
    const call = (repo.replaceDataset as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(call[1].tracks.map((t: TrackRow) => t.key)).toEqual(['ok']);
  });

  it('skips a dataset written by a newer app and names it as stale', async () => {
    const fake = seededServer();
    fake.tables.datasets[0].schema_version = 9;
    const { repo } = fakeRepo(emptyRows(), { accountId: 'acc' });
    const res = await runPull(deps(fake, repo).d);
    expect(res).toEqual({
      ok: true,
      value: { pulled: ['library'], rejected: 0, stale: ['history'] },
    });
  });

  it('refuses when the server holds another account and not this one', async () => {
    const fake = seededServer('other');
    const { repo } = fakeRepo(emptyRows(), { accountId: 'acc' });
    const res = await runPull(deps(fake, repo).d);
    expect(res).toEqual({
      ok: false,
      kind: 'error',
      message: ACCOUNT_MISMATCH_NOTICE,
    });
    expect(repo.replaceDataset).not.toHaveBeenCalled();
  });

  it('skips with noAccount when Spotify was never connected here', async () => {
    const fake = seededServer();
    const { repo } = fakeRepo(emptyRows(), {});
    const res = await runPull(deps(fake, repo).d);
    expect(res).toEqual({
      ok: true,
      value: { pulled: [], rejected: 0, stale: [], skipped: 'noAccount' },
    });
    expect(fake.calls).toEqual([]);
  });

  it('an offline first request returns offline without touching the repo', async () => {
    const fake = seededServer();
    fake.failSelect = { ok: false, kind: 'offline', message: 'down' };
    const { repo } = fakeRepo(emptyRows(), { accountId: 'acc' });
    const res = await runPull(deps(fake, repo).d);
    expect(res).toMatchObject({ ok: false, kind: 'offline' });
    expect(repo.replaceDataset).not.toHaveBeenCalled();
  });
});

/* ---------- identify requests (worker round) ---------- */

const JOB_URL = 'https://www.youtube.com/watch?v=abc123';
const RESULT = {
  mix_info: {
    title: 'A set',
    artist: 'Someone',
    audio_filename: 'abc123.webm',
    source_url: JOB_URL,
  },
  tracks: [
    {
      song_name: 'Noble Booth',
      artist: 'Stefan Gubatz',
      time_in_mix: '00:00:00',
      confidence: 86.1,
      metadata: { isrc: 'DECH62001634', label: 'Primary Colours' },
    },
    {
      song_name: 'Katerina',
      artist: 'Mixxwave',
      time_in_mix: '00:25:50',
      confidence: 97.7,
    },
  ],
};

function doneJob(over: Row = {}): Row {
  return {
    id: '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
    kind: 'identify-mix',
    payload: { url: JOB_URL },
    status: 'done',
    claimed_by: 'laptop',
    claimed_at: '2026-11-06T09:40:00.000Z',
    finished_at: '2026-11-06T10:05:00.000Z',
    error: null,
    result: RESULT,
    created_at: '2026-11-06T09:12:00.000Z',
    applied_at: null,
    ...over,
  };
}

describe('identify requests (worker round)', () => {
  it('requestIdentify inserts once and answers exists while a request is open', async () => {
    const fake = fakeServer();
    const first = await requestIdentify(fake.client, 'tok', JOB_URL);
    expect(
      first.ok && first.value !== 'exists' && first.value.status === 'queued'
    ).toBe(true);
    expect(fake.tables.jobs).toHaveLength(1);
    expect(fake.tables.jobs[0]).toMatchObject({
      kind: 'identify-mix',
      payload: { url: JOB_URL },
    });
    const second = await requestIdentify(fake.client, 'tok', JOB_URL);
    expect(second).toEqual({ ok: true, value: 'exists' });
    fake.tables.jobs[0].status = 'claimed';
    expect(await requestIdentify(fake.client, 'tok', JOB_URL)).toEqual({
      ok: true,
      value: 'exists',
    });
    fake.tables.jobs[0].status = 'failed';
    const again = await requestIdentify(fake.client, 'tok', JOB_URL);
    expect(again.ok && again.value !== 'exists').toBe(true);
    expect(fake.tables.jobs).toHaveLength(2);
    expect(fake.calls.some((c) => c.includes('spotify'))).toBe(false);
  });

  it('the pull applies a done result to a new mix, marks it, flags the push and records the history', async () => {
    const fake = seededServer();
    fake.tables.jobs.push(doneJob());
    const { repo, state } = fakeRepo(emptyRows(), { accountId: 'acc' });
    const { d } = deps(fake, repo);
    const res = await runPull(d);
    if (!res.ok) throw new Error(res.message);
    expect(res.value.rejected).toBe(0);
    const mix = state.mixes.find((m) => m.url === JOB_URL);
    expect(mix).toBeDefined();
    expect(mix).toMatchObject({
      title: 'A set',
      author: 'Someone',
      playerSrc: null,
      slug: null,
      sources: {
        trackid: false,
        description: false,
        pasted: false,
        linkOut: null,
        worker: true,
      },
      identifyJobId: '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
      identifiedAt: Date.parse('2026-11-06T10:05:00.000Z'),
      savedAt: 5_000,
    });
    expect(mix?.rows.map((r) => r.title)).toEqual(['Noble Booth', 'Katerina']);
    expect(mix?.rows[0].isrc).toBe('DECH62001634');
    expect(fake.tables.jobs[0].applied_at).not.toBeNull();
    expect((state.metas[SERVER_PENDING_META] as ServerPending).mixes).toBe(
      true
    );
    const jobs = state.metas[MIX_JOBS_META] as MixJobs;
    expect(jobs[JOB_URL]).toHaveLength(1);
    expect(jobs[JOB_URL][0]).toMatchObject({
      status: 'done',
      claimedBy: 'laptop',
    });
    expect(jobs[JOB_URL][0].appliedAt).not.toBeNull();
    expect(res.value.pulled).toContain('mixes');
  });

  it('merges into an existing mix, keeping edits and manual rows', async () => {
    const fake = seededServer();
    fake.tables.jobs.push(doneJob());
    const existing = mix(JOB_URL, 100, 'Kept title');
    existing.rows = [
      {
        startSec: 0,
        endSec: null,
        artist: 'Stefan Gubatz',
        title: 'Noble Booth (my edit)',
        label: null,
        source: 'manual',
        gap: false,
        detected: { artist: 'Stefan Gubatz', title: 'Noble Booth' },
        referenceCount: null,
      },
      {
        startSec: 60,
        endSec: null,
        artist: 'Old',
        title: 'Scan row',
        label: null,
        source: 'tracklistify',
        gap: false,
        detected: { artist: 'Old', title: 'Scan row' },
        referenceCount: null,
      },
    ];
    const { repo, state } = fakeRepo(emptyRows(), { accountId: 'acc' }, [
      existing,
    ]);
    const { d } = deps(fake, repo);
    const res = await runPull(d);
    expect(res.ok).toBe(true);
    const merged = state.mixes.find((m) => m.url === JOB_URL);
    expect(merged?.title).toBe('Kept title');
    // The incoming Noble Booth is the track the owner edited: dropped (T125).
    expect(merged?.rows.map((r) => r.title)).toEqual([
      'Noble Booth (my edit)',
      'Katerina',
    ]);
    expect(merged?.sources.worker).toBe(true);
  });

  it('a later result keeps the review and leaves removed tracks out (T125)', async () => {
    const fake = seededServer();
    fake.tables.jobs.push(doneJob());
    const existing = mix(JOB_URL, 100, 'Kept title');
    const spotify = {
      id: 'abc',
      url: 'https://open.spotify.com/track/abc',
    };
    existing.rows = [
      {
        startSec: 0,
        endSec: null,
        artist: 'Stefan Gubatz',
        title: 'Noble Booth',
        label: null,
        source: 'tracklistify',
        gap: false,
        detected: { artist: 'Stefan Gubatz', title: 'Noble Booth' },
        referenceCount: null,
        isrc: 'DECH62001634',
        validated: true,
        spotify,
        checkedAt: 7,
      },
    ];
    existing.removed = [{ artist: 'Mixxwave', title: 'Katerina', isrc: null }];
    const { repo, state } = fakeRepo(emptyRows(), { accountId: 'acc' }, [
      existing,
    ]);
    expect((await runPull(deps(fake, repo).d)).ok).toBe(true);
    const merged = state.mixes.find((m) => m.url === JOB_URL);
    expect(merged?.rows).toHaveLength(1);
    expect(merged?.rows[0]).toMatchObject({
      title: 'Noble Booth',
      label: 'Primary Colours',
      validated: true,
      spotify,
      checkedAt: 7,
    });
    expect(merged?.removed).toEqual(existing.removed);
  });

  it('replaces the run wholesale with each result (T124)', async () => {
    const fake = seededServer();
    fake.tables.jobs.push(
      doneJob({
        result: {
          ...RESULT,
          mix_info: {
            ...RESULT.mix_info,
            second_pass: { places: 41, found: 3, stopped: null },
          },
        },
      })
    );
    const existing = mix(JOB_URL, 100, 'Kept title');
    existing.run = {
      stoppedEarly: { at: '01:12:00', reason: 'by you' },
      warnings: ['refuses often'],
    };
    const { repo, state } = fakeRepo(emptyRows(), { accountId: 'acc' }, [
      existing,
    ]);
    expect((await runPull(deps(fake, repo).d)).ok).toBe(true);
    expect(state.mixes.find((m) => m.url === JOB_URL)?.run).toEqual({
      secondPass: { places: 41, found: 3, stopped: null },
    });
  });

  it('a result without a run clears the old one (T124)', async () => {
    const fake = seededServer();
    fake.tables.jobs.push(doneJob());
    const existing = mix(JOB_URL, 100, 'Kept title');
    existing.run = { warnings: ['refuses often'] };
    const { repo, state } = fakeRepo(emptyRows(), { accountId: 'acc' }, [
      existing,
    ]);
    expect((await runPull(deps(fake, repo).d)).ok).toBe(true);
    expect(state.mixes.find((m) => m.url === JOB_URL)?.run).toBeUndefined();
  });

  it('a second device skips an applied result and gets the mix through the mixes sync', async () => {
    const fake = seededServer();
    fake.tables.jobs.push(doneJob());
    const a = fakeRepo(emptyRows(), { accountId: 'acc' });
    const b = fakeRepo(emptyRows(), { accountId: 'acc' });
    expect((await runPull(deps(fake, a.repo).d)).ok).toBe(true);
    const pushed = await runPush(deps(fake, a.repo).d, ['mixes']);
    expect(pushed.ok).toBe(true);
    const before = fake.calls.length;
    const res = await runPull(deps(fake, b.repo).d);
    if (!res.ok) throw new Error(res.message);
    expect(b.repo.putMix).toHaveBeenCalledTimes(1);
    expect(b.state.mixes[0].url).toBe(JOB_URL);
    expect(
      fake.calls.slice(before).filter((c) => c.startsWith('update jobs'))
    ).toHaveLength(0);
    const jobs = b.state.metas[MIX_JOBS_META] as MixJobs;
    expect(jobs[JOB_URL][0].status).toBe('done');
  });

  it('a result that fails the safety check is counted, not applied, not marked', async () => {
    const fake = seededServer();
    fake.tables.jobs.push(doneJob({ result: { tracks: [] } }));
    const { repo, state } = fakeRepo(emptyRows(), { accountId: 'acc' });
    const res = await runPull(deps(fake, repo).d);
    if (!res.ok) throw new Error(res.message);
    expect(res.value.rejected).toBe(1);
    expect(state.mixes).toHaveLength(0);
    expect(fake.tables.jobs[0].applied_at).toBeNull();
    const jobs = state.metas[MIX_JOBS_META] as MixJobs;
    expect(jobs[JOB_URL][0].rejected).toBe(true);
  });

  it('a row the validator refuses is dropped and counted; the history is newest first and capped at 20', async () => {
    const fake = seededServer();
    fake.tables.jobs.push(doneJob({ id: 'bad', status: 'failed' }));
    for (let i = 0; i < 25; i++) {
      fake.tables.jobs.push(
        doneJob({
          id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          status: 'failed',
          error: `reason ${i}`,
          result: null,
          created_at: new Date(
            Date.parse('2026-11-01T00:00:00.000Z') + i * 60_000
          ).toISOString(),
        })
      );
    }
    const { repo, state } = fakeRepo(emptyRows(), { accountId: 'acc' });
    const res = await runPull(deps(fake, repo).d);
    if (!res.ok) throw new Error(res.message);
    expect(res.value.rejected).toBe(1);
    const jobs = state.metas[MIX_JOBS_META] as MixJobs;
    expect(jobs[JOB_URL]).toHaveLength(20);
    expect(jobs[JOB_URL][0].error).toBe('reason 24');
    expect(jobs[JOB_URL][19].error).toBe('reason 5');
  });

  it('a failed row with an over-long error is rejected, not truncated', async () => {
    const fake = seededServer();
    fake.tables.jobs.push(
      doneJob({ status: 'failed', error: 'x'.repeat(201), result: null })
    );
    const { repo, state } = fakeRepo(emptyRows(), { accountId: 'acc' });
    const res = await runPull(deps(fake, repo).d);
    if (!res.ok) throw new Error(res.message);
    expect(res.value.rejected).toBe(1);
    expect((state.metas[MIX_JOBS_META] as MixJobs)[JOB_URL]).toBeUndefined();
  });

  it('runRemoveAll deletes the jobs and the mixJobs meta', async () => {
    const fake = seededServer();
    fake.tables.jobs.push(doneJob());
    const { repo, state } = fakeRepo(emptyRows(), {
      accountId: 'acc',
      [MIX_JOBS_META]: { x: [] },
    });
    const res = await runRemoveAll(deps(fake, repo).d);
    expect(res.ok).toBe(true);
    expect(fake.tables.jobs).toHaveLength(0);
    expect(state.metas[MIX_JOBS_META]).toBeUndefined();
  });
});

describe('queue control and progress (round 004)', () => {
  function queued(n: number, over: Row = {}): Row {
    return {
      id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      kind: 'identify-mix',
      payload: { url: `https://soundcloud.com/a/${n}` },
      status: 'queued',
      priority: 0,
      claimed_by: null,
      claimed_at: null,
      finished_at: null,
      error: null,
      applied_at: null,
      created_at: '2026-11-06T10:00:00.000Z',
      ...over,
    };
  }

  it('cancels a waiting request only', async () => {
    const fake = fakeServer({
      jobs: [queued(1), queued(2, { status: 'claimed' })],
    });
    const first = String(fake.tables.jobs[0].id);
    const taken = String(fake.tables.jobs[1].id);
    expect(await cancelRequest(fake.client, 'tok', first)).toEqual({
      ok: true,
      value: 'cancelled',
    });
    // Already gone, or already taken by the computer: 'gone' (ruling D4).
    expect(await cancelRequest(fake.client, 'tok', first)).toEqual({
      ok: true,
      value: 'gone',
    });
    expect(await cancelRequest(fake.client, 'tok', taken)).toEqual({
      ok: true,
      value: 'gone',
    });
    expect(fake.tables.jobs.map((r) => r.status)).toEqual(['claimed']);
  });

  it('moves a waiting request above the others', async () => {
    const fake = fakeServer({
      jobs: [
        queued(1, { priority: 2 }),
        queued(2),
        queued(3, { status: 'claimed' }),
      ],
    });
    const res = await moveRequestToTop(
      fake.client,
      'tok',
      String(fake.tables.jobs[1].id)
    );
    expect(res).toEqual({ ok: true, value: 'moved' });
    expect(fake.tables.jobs[1].priority).toBe(3);
    expect(
      await moveRequestToTop(fake.client, 'tok', String(fake.tables.jobs[2].id))
    ).toEqual({ ok: true, value: 'gone' });
  });

  it('asks a running request to stop, or says it is gone', async () => {
    const fake = fakeServer({
      jobs: [queued(1, { status: 'claimed' }), queued(2, { status: 'done' })],
    });
    const now = Date.parse('2026-11-06T21:00:00Z');
    expect(
      await stopRequest(fake.client, 'tok', String(fake.tables.jobs[0].id), now)
    ).toEqual({ ok: true, value: 'asked' });
    expect(fake.tables.jobs[0].stop_requested_at).toBe(
      '2026-11-06T21:00:00.000Z'
    );
    expect(
      await stopRequest(fake.client, 'tok', String(fake.tables.jobs[1].id), now)
    ).toEqual({ ok: true, value: 'gone' });
  });

  it('pulls without progress when the server has no 0003 migration', async () => {
    const fake = seededServer();
    fake.tables.jobs.push(queued(9, { payload: { url: JOB_URL } }));
    const select = fake.client.select.bind(fake.client);
    fake.client.select = (async (
      table: string,
      query: Query,
      token: string,
      range?: [number, number]
    ) => {
      if (table === 'jobs' && query.select?.includes('progress')) {
        return {
          ok: false,
          kind: 'error',
          message: 'column jobs.progress does not exist',
        };
      }
      return select(table, query, token, range);
    }) as typeof fake.client.select;
    const { repo, state } = fakeRepo(emptyRows(), { accountId: 'acc' });
    const { d } = deps(fake, repo);
    const res = await runPull(d);
    expect(res.ok).toBe(true);
    const jobs = state.metas[MIX_JOBS_META] as MixJobs;
    expect(jobs[JOB_URL][0]).toMatchObject({
      status: 'queued',
      progress: null,
      priority: 0,
    });
  });
});
