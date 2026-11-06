import { describe, expect, it } from 'vitest';
import type { MixJobView } from '../../db/schema';
import type { ServerStatus } from '../../server/types';
import { mixListItems, type MixListMix } from './mixList';

const connected: ServerStatus = {
  status: 'connected',
  lastSyncAt: null,
  usedBytes: null,
  stamps: [],
  rejected: 0,
};
const NOW = Date.parse('2026-11-06T12:00:00.000Z');
const MIN = 60_000;

function view(over: Partial<MixJobView>): MixJobView {
  return {
    id: 'r',
    status: 'queued',
    createdAt: NOW - 60 * MIN,
    claimedBy: null,
    claimedAt: null,
    finishedAt: null,
    error: null,
    appliedAt: null,
    progress: null,
    priority: 0,
    stopRequestedAt: null,
    ...over,
  };
}

function progress(
  over: Partial<NonNullable<MixJobView['progress']>> & { step: string }
): MixJobView['progress'] {
  return {
    done: null,
    total: null,
    percent: null,
    minutesLeft: null,
    pausedUntil: null,
    warning: null,
    at: NOW - MIN,
    ...over,
  };
}

function mix(url: string, over: Partial<MixListMix> = {}): MixListMix {
  return {
    url,
    title: `Title of ${url}`,
    savedAt: NOW - 24 * 60 * MIN,
    rows: [{}, {}, { gap: true }, {}],
    ...over,
  };
}

const one = (
  jobs: Record<string, MixJobView[]>,
  mixes: MixListMix[] = [],
  server: ServerStatus = connected
) => mixListItems(jobs, mixes, server, NOW);

describe('mixListItems — chips', () => {
  it('Queued, with Move to top and Cancel', () => {
    const [item] = one({ a: [view({})] });
    expect(item.chip).toEqual({ kind: 'queued', text: 'Queued' });
    expect(item.line).toContain('Waiting for your computer since');
    expect(item).toMatchObject({
      canCancel: true,
      canStop: false,
      canAskAgain: false,
      percent: null,
    });
  });

  it('Identifying, with the progress line, percent, step name and Stop', () => {
    const [item] = one({
      a: [
        view({
          status: 'claimed',
          claimedBy: 'pc',
          claimedAt: NOW - 10 * MIN,
          progress: progress({ step: 'first', percent: 47, minutesLeft: 25 }),
        }),
      ],
    });
    expect(item.chip).toEqual({ kind: 'identifying', text: 'Identifying' });
    expect(item.line).toBe('First pass · 47 % · about 25 min left');
    expect(item).toMatchObject({
      percent: 47,
      step: 'First pass',
      canStop: true,
      canCancel: false,
      canMoveToTop: false,
    });
  });

  it('Identifying without progress says where it runs', () => {
    const [item] = one({
      a: [view({ status: 'claimed', claimedBy: 'pc', claimedAt: NOW })],
    });
    expect(item.chip.kind).toBe('identifying');
    expect(item.line).toContain('Running on pc since');
    expect(item.percent).toBeNull();
  });

  it('Paused when the step is paused', () => {
    const [item] = one({
      a: [
        view({
          status: 'claimed',
          progress: progress({ step: 'paused', pausedUntil: NOW + 30 * MIN }),
        }),
      ],
    });
    expect(item.chip).toEqual({ kind: 'paused', text: 'Paused' });
    expect(item.line).toContain('Paused by Shazam until');
  });

  it('Stopping… when Stop was asked; Stop is then not offered', () => {
    const [item] = one({
      a: [
        view({
          status: 'claimed',
          stopRequestedAt: NOW - MIN,
          progress: progress({ step: 'paused' }),
        }),
      ],
    });
    expect(item.chip).toEqual({ kind: 'stopping', text: 'Stopping…' });
    expect(item.line).toContain('stopping…');
    expect(item).toMatchObject({ canStop: false, stopping: true });
  });

  it('says when the news stopped coming', () => {
    const [item] = one({
      a: [
        view({
          status: 'claimed',
          progress: progress({ step: 'first', at: NOW - 25 * MIN }),
        }),
      ],
    });
    expect(item.line).toContain('the computer stopped sending news');
  });

  it('Found tracks for a done result not saved here yet', () => {
    const [item] = one({
      a: [view({ status: 'done', finishedAt: NOW - MIN })],
    });
    expect(item.chip).toEqual({ kind: 'found', text: 'Found tracks' });
    expect(item.saved).toBe(false);
  });

  it('Failed with its reason inline, and Ask again', () => {
    const [item] = one({
      a: [
        view({
          status: 'failed',
          finishedAt: NOW - MIN,
          error: 'Recognition service did not answer; try later',
        }),
      ],
    });
    expect(item.chip).toEqual({ kind: 'failed', text: 'Failed' });
    expect(item.line).toMatch(
      /^Failed .*: Recognition service did not answer; try later$/
    );
    expect(item.canAskAgain).toBe(true);
  });

  it('Rejected with "Result rejected — ask again"', () => {
    const [item] = one({
      a: [view({ status: 'done', finishedAt: NOW, rejected: true })],
    });
    expect(item.chip).toEqual({ kind: 'rejected', text: 'Rejected' });
    expect(item.line).toBe('Result rejected — ask again');
    expect(item.canAskAgain).toBe(true);
  });

  it('Saved · N tracks, N without gap rows, candidates counted', () => {
    const [item] = one({}, [
      mix('a', {
        rows: [{}, { gap: true }, { origin: 'clue' }, {}],
      }),
    ]);
    expect(item.chip).toEqual({ kind: 'saved', text: 'Saved · 3 tracks' });
    expect(item).toMatchObject({ saved: true, request: null, line: null });
  });

  it('adds K validated once a track is validated', () => {
    const [item] = one({}, [
      mix('a', { rows: [{ validated: true }, {}, { gap: true }] }),
    ]);
    expect(item.chip.text).toBe('Saved · 2 tracks · 1 validated');
  });

  it('Playlist made once a playlist was created', () => {
    const [item] = one({}, [
      mix('a', { playlistUrl: 'https://open.spotify.com/playlist/x' }),
    ]);
    expect(item.chip).toEqual({ kind: 'playlist', text: 'Playlist made' });
  });

  it('a saved mix with a done request keeps Saved and the Done line', () => {
    const [item] = one(
      {
        a: [
          view({
            status: 'done',
            finishedAt: NOW - 2 * 24 * 60 * MIN,
            appliedAt: NOW,
          }),
        ],
      },
      [mix('a')]
    );
    expect(item.chip.kind).toBe('saved');
    expect(item.line).toMatch(/^Done /);
  });

  it('a saved mix with a running request shows the request', () => {
    const [item] = one(
      {
        a: [view({ status: 'claimed', progress: progress({ step: 'first' }) })],
      },
      [mix('a')]
    );
    expect(item.chip.kind).toBe('identifying');
    expect(item.saved).toBe(true);
  });

  it('a failure newer than the saved mix shows Failed; an older one Saved', () => {
    const failed = view({ status: 'failed', finishedAt: NOW, error: 'x' });
    expect(one({ a: [failed] }, [mix('a')])[0].chip.kind).toBe('failed');
    const old = { ...failed, finishedAt: NOW - 3 * 24 * 60 * MIN };
    expect(one({ a: [old] }, [mix('a')])[0].chip.kind).toBe('saved');
  });

  it('Ask again on a done request stopped early (and not on a plain done)', () => {
    const early = view({
      status: 'done',
      finishedAt: NOW,
      appliedAt: NOW,
      error: 'Stopped early at 01:12:00 (by you); ask again later for the rest',
    });
    const [item] = one({ a: [early] }, [mix('a')]);
    expect(item.canAskAgain).toBe(true);
    expect(item.line).toContain('Stopped early at 01:12:00 (by you)');
    const plain = { ...early, error: null };
    expect(one({ a: [plain] }, [mix('a')])[0].canAskAgain).toBe(false);
  });

  it('offers Ask again only when the server can take a request', () => {
    const failed = view({ status: 'failed', finishedAt: NOW, error: 'x' });
    const offline = one({ a: [failed] }, [], {
      status: 'offline',
      message: 'x',
    });
    expect(offline[0].canAskAgain).toBe(false);
  });

  it('keeps the earlier requests of a link, newest first', () => {
    const [item] = one({
      a: [view({ id: 'new' }), view({ id: 'old', status: 'failed' })],
    });
    expect(item.request?.id).toBe('new');
    expect(item.earlier.map((v) => v.id)).toEqual(['old']);
  });

  it('names an unnamed link by its host and last path part', () => {
    const [item] = one({ 'https://soundcloud.com/x/my-set': [view({})] });
    expect(item.title).toBe('soundcloud.com · my-set');
    const [saved] = one({}, [
      mix('https://soundcloud.com/x/y', { title: null }),
    ]);
    expect(saved.title).toBe('soundcloud.com · y');
  });
});

describe('mixListItems — order', () => {
  it('running, then queued by priority then oldest, then the rest newest first', () => {
    const items = one(
      {
        done: [view({ id: 'done', status: 'done', finishedAt: NOW - 5 * MIN })],
        q1: [view({ id: 'q1', createdAt: NOW - 90 * MIN })],
        q2: [view({ id: 'q2', createdAt: NOW - 30 * MIN, priority: 1 })],
        q3: [view({ id: 'q3', createdAt: NOW - 60 * MIN })],
        run: [view({ id: 'run', status: 'claimed', claimedAt: NOW - MIN })],
      },
      [
        mix('old-saved', { savedAt: NOW - 10 * 24 * 60 * MIN }),
        mix('new-saved', { savedAt: NOW - MIN }),
      ]
    );
    expect(items.map((i) => i.key)).toEqual([
      'run',
      'q2',
      'q1',
      'q3',
      'new-saved',
      'done',
      'old-saved',
    ]);
  });

  it('Move to top only on a queued row that is not first', () => {
    const items = one({
      q1: [view({ id: 'q1', createdAt: NOW - 90 * MIN })],
      q2: [view({ id: 'q2', createdAt: NOW - 30 * MIN })],
    });
    expect(items.map((i) => [i.key, i.canMoveToTop])).toEqual([
      ['q1', false],
      ['q2', true],
    ]);
  });

  it('a link with no request and no saved mix gives no row', () => {
    expect(one({ empty: [] })).toEqual([]);
  });
});
