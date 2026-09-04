import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAllRows,
  getMeta,
  putMeta,
  replacePlaylist,
  wipeDb,
} from '../db/repo';
import { paginate, type Query, type SpotifyClient } from '../spotify/client';
import { ApiError, QuotaError } from '../spotify/errors';
import type { ApiPlaylistItem, ApiPlaylistSummary } from '../spotify/types';
import { runSync, type SyncState } from './runner';

type Handler = (query: Query) => unknown;

function fakeClient(routes: Record<string, Handler>) {
  const calls: Array<{ path: string; query: Query }> = [];
  const get = async <T>(path: string, query: Query = {}): Promise<T> => {
    calls.push({ path, query });
    const handler = routes[path];
    if (!handler) throw new ApiError(404, `no route for ${path}`);
    const result = handler(query);
    if (result instanceof Error) throw result;
    return result as T;
  };
  const client: SpotifyClient = {
    get,
    pages: <T>(path: string, query?: Query, limit?: number) =>
      paginate<T>(get, path, query, limit),
  };
  return { client, calls };
}

function summary(
  id: string,
  owner = 'me',
  snapshot = 's1'
): ApiPlaylistSummary {
  return {
    id,
    name: `P ${id}`,
    snapshot_id: snapshot,
    owner: { id: owner },
    items: { total: 0 },
  };
}

function trackItem(id: string): ApiPlaylistItem {
  return {
    added_at: '2024-01-01T00:00:00Z',
    is_local: false,
    item: {
      type: 'track',
      id,
      uri: `spotify:track:${id}`,
      name: `T ${id}`,
      duration_ms: 1000,
      artists: [{ id: 'a1', name: 'A' }],
      album: { name: 'Al' },
    },
  };
}

const localItem: ApiPlaylistItem = {
  added_at: null,
  is_local: true,
  item: {
    type: 'track',
    id: null,
    uri: 'spotify:local:A:Al:Local:100',
    name: 'Local',
    duration_ms: 100000,
    artists: [{ id: null, name: 'A' }],
    album: { name: 'Al' },
  },
};

function page<T>(all: T[], query: Query) {
  const offset = Number(query.offset ?? 0);
  const limit = Number(query.limit ?? 50);
  return { items: all.slice(offset, offset + limit), total: all.length };
}

const p1Items: ApiPlaylistItem[] = [
  ...Array.from({ length: 60 }, (_, i) => trackItem(`t${i}`)),
  { added_at: null, item: null },
  {
    added_at: null,
    item: { type: 'episode', id: 'e', uri: 'spotify:episode:e', name: 'E' },
  },
  localItem,
];

function baseRoutes(
  playlists: ApiPlaylistSummary[],
  items: Record<string, ApiPlaylistItem[]>
): Record<string, Handler> {
  const routes: Record<string, Handler> = {
    '/me': () => ({ id: 'me' }),
    '/me/top/tracks': () => ({
      items: [
        {
          id: 'x',
          uri: 'spotify:track:x',
          name: 'X',
          duration_ms: 1,
          artists: [{ id: 'a1', name: 'A' }],
          album: { name: 'Al', images: [{ url: 'img', height: 1, width: 1 }] },
        },
      ],
    }),
    '/me/top/artists': () => ({ items: [{ id: 'a1', name: 'A' }] }),
    '/me/playlists': (q) => page(playlists, q),
  };
  for (const [id, list] of Object.entries(items)) {
    routes[`/playlists/${id}/items`] = (q) => page(list, q);
  }
  return routes;
}

async function run(
  routes: Record<string, Handler>,
  opts: {
    priorityId?: string;
    acquireWakeLock?: () => Promise<() => Promise<void>>;
  } = {}
) {
  const states: SyncState[] = [];
  const { client, calls } = fakeClient(routes);
  await runSync(
    {
      client,
      now: () => 42,
      onState: (s) => states.push(s),
      acquireWakeLock: opts.acquireWakeLock,
    },
    { priorityId: opts.priorityId }
  );
  return { states, calls };
}

const itemCalls = (calls: Array<{ path: string; query: Query }>) =>
  calls.filter((c) => c.path.endsWith('/items'));

beforeEach(async () => {
  await wipeDb();
});

describe('runSync first sync', () => {
  it('stores profile, top lists, owned playlists and their items', async () => {
    const { states, calls } = await run(
      baseRoutes([summary('p1'), summary('other', 'someone'), summary('p2')], {
        p1: p1Items,
        p2: [trackItem('z')],
      })
    );
    expect(states.at(-1)).toEqual({ status: 'idle' });
    const rows = await getAllRows();
    expect(rows.playlists.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    expect(rows.playlists[0].syncedAt).toBe(42);
    expect(rows.entries.filter((e) => e.playlistId === 'p1')).toHaveLength(61);
    expect(rows.tracks.some((t) => t.isLocal)).toBe(true);
    expect(rows.topItems).toHaveLength(6);
    expect(
      rows.topItems.find((t) => t.key === 'tracks:short_term')
    ).toMatchObject({
      type: 'tracks',
      items: [{ rank: 1, id: 'x', imageUrl: 'img' }],
    });
    await expect(getMeta('lastSyncAt')).resolves.toBe(42);
    await expect(getMeta('accountId')).resolves.toBe('me');
    await expect(getMeta('syncState')).resolves.toEqual({ status: 'idle' });
    expect(calls.some((c) => c.path === '/playlists/other/items')).toBe(false);
    expect(itemCalls(calls).map((c) => c.query.offset)).toEqual([0, 50, 0]);
    expect(String(itemCalls(calls)[0].query.fields)).toContain('item(');
    const running = states.filter((s) => s.status === 'running');
    expect(
      running.map((s) => (s.status === 'running' ? s.current : ''))
    ).toContain('P p1');
  });

  it('skips unchanged playlists on the next sync and refetches changed ones', async () => {
    const routes = baseRoutes([summary('p1'), summary('p2')], {
      p1: [trackItem('a')],
      p2: [trackItem('b')],
    });
    await run(routes);
    const second = await run(routes);
    expect(itemCalls(second.calls)).toHaveLength(0);

    const changed = baseRoutes([summary('p1', 'me', 's2')], {
      p1: [trackItem('c')],
    });
    const third = await run(changed);
    expect(itemCalls(third.calls).map((c) => c.path)).toEqual([
      '/playlists/p1/items',
    ]);
    const rows = await getAllRows();
    expect(rows.playlists.map((p) => p.id)).toEqual(['p1']);
    expect(rows.entries.map((e) => e.trackKey)).toEqual(['c']);
  });

  it('fetches the priority playlist first', async () => {
    const { calls } = await run(
      baseRoutes([summary('p1'), summary('p2')], {
        p1: [trackItem('a')],
        p2: [trackItem('b')],
      }),
      { priorityId: 'p2' }
    );
    expect(itemCalls(calls).map((c) => c.path)).toEqual([
      '/playlists/p2/items',
      '/playlists/p1/items',
    ]);
  });
});

describe('runSync resilience', () => {
  it('locks on QuotaError, keeps finished playlists and lists the pending ones', async () => {
    const routes = baseRoutes([summary('p1'), summary('p2')], {
      p1: [trackItem('a')],
    });
    routes['/playlists/p2/items'] = () => new QuotaError(999);
    const { states } = await run(routes);
    expect(states.at(-1)).toEqual({
      status: 'locked',
      retryAt: 999,
      pending: ['p2'],
      done: 1,
      total: 2,
    });
    const rows = await getAllRows();
    expect(rows.playlists.map((p) => p.id)).toEqual(['p1']);
    await expect(getMeta('syncState')).resolves.toMatchObject({
      status: 'locked',
    });
    await expect(getMeta('lastSyncAt')).resolves.toBeUndefined();
  });

  it('falls back through fields variants on 400', async () => {
    const routes = baseRoutes([summary('p1'), summary('p2')], {});
    const handler = (q: Query) =>
      String(q.fields ?? '').includes('item(')
        ? new ApiError(400, 'bad fields')
        : page([trackItem('a')], q);
    routes['/playlists/p1/items'] = handler;
    routes['/playlists/p2/items'] = handler;
    const { states, calls } = await run(routes);
    expect(states.at(-1)).toEqual({ status: 'idle' });
    const fields = itemCalls(calls).map((c) =>
      String(c.query.fields ?? 'none')
    );
    expect(fields[0]).toContain('item(');
    expect(fields[1]).toContain('track(');
    expect(fields[2]).toContain('track(');
    expect(fields).toHaveLength(3);
  });

  it('falls back when a fields variant strips the playable objects', async () => {
    const routes = baseRoutes([summary('p1'), summary('p2')], {});
    const handler = (q: Query) =>
      String(q.fields ?? '').includes('item(')
        ? page([{ added_at: null, is_local: false }], q)
        : page([trackItem('a')], q);
    routes['/playlists/p1/items'] = handler;
    routes['/playlists/p2/items'] = handler;
    const { states, calls } = await run(routes);
    expect(states.at(-1)).toEqual({ status: 'idle' });
    const variants = itemCalls(calls).map((c) =>
      String(c.query.fields ?? '').includes('item(') ? 'item' : 'track'
    );
    expect(variants).toEqual(['item', 'track', 'track']);
    expect((await getAllRows()).entries).toHaveLength(2);
  });

  it('does not lock in an unproven fields variant from an empty first playlist', async () => {
    const routes = baseRoutes([summary('p1'), summary('p2')], {});
    routes['/playlists/p1/items'] = (q) => page([], q);
    routes['/playlists/p2/items'] = (q) =>
      String(q.fields ?? '').includes('item(')
        ? page([{ added_at: null, is_local: false }], q)
        : page([trackItem('a')], q);
    const { states, calls } = await run(routes);
    expect(states.at(-1)).toEqual({ status: 'idle' });
    const variants = itemCalls(calls).map((c) =>
      String(c.query.fields ?? '').includes('item(') ? 'item' : 'track'
    );
    expect(variants).toEqual(['item', 'item', 'track']);
    const rows = await getAllRows();
    expect(rows.entries.filter((e) => e.playlistId === 'p2')).toHaveLength(1);
  });

  it('reports an error state with the message and pending ids', async () => {
    const routes = baseRoutes([summary('p1')], {});
    routes['/playlists/p1/items'] = () => new ApiError(500, 'boom');
    const { states } = await run(routes);
    expect(states.at(-1)).toEqual({
      status: 'error',
      message: 'Spotify error 500: boom',
      pending: ['p1'],
    });
  });

  it('turns a 403 on the profile into the allow-list message', async () => {
    const routes = baseRoutes([], {});
    routes['/me'] = () => new ApiError(403, 'Forbidden');
    const { states } = await run(routes);
    expect(states.at(-1)).toMatchObject({
      status: 'error',
      message: expect.stringContaining('user list'),
      auth: true,
    });
  });

  it('wipes the cache when a different account logs in', async () => {
    await replacePlaylist(
      {
        id: 'old',
        name: 'Old',
        snapshotId: 's',
        itemCount: 0,
        imageUrl: null,
        spotifyUrl: null,
        syncedAt: 1,
      },
      [
        {
          key: 'stale',
          id: 'stale',
          uri: 'spotify:track:stale',
          name: 'Stale',
          artists: [],
          album: '',
          durationMs: 1,
          isrc: null,
          spotifyUrl: null,
          isLocal: false,
        },
      ],
      []
    );
    await putMeta('accountId', 'someone-else');
    await run(baseRoutes([summary('p1')], { p1: [] }));
    const rows = await getAllRows();
    expect(rows.playlists.map((p) => p.id)).toEqual(['p1']);
    expect(rows.tracks.map((t) => t.key)).not.toContain('stale');
    await expect(getMeta('accountId')).resolves.toBe('me');
  });

  it('acquires and releases the wake lock even on failure', async () => {
    const release = vi.fn(async () => {});
    const acquireWakeLock = vi.fn(async () => release);
    const routes = baseRoutes([summary('p1')], {});
    routes['/playlists/p1/items'] = () => new ApiError(500, 'boom');
    await run(routes, { acquireWakeLock });
    expect(acquireWakeLock).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
