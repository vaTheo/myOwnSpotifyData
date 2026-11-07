import { describe, expect, it } from 'vitest';
import { activeJobs, type JobStates } from './jobs';
import { PASS_BY_ID, PASS_BY_ISRC, PASS_YEARS } from '../features/lookup';

const IDLE: JobStates = {
  sync: { status: 'idle' },
  import: { status: 'idle' },
  lookup: { status: 'idle' },
  rekordbox: { status: 'idle' },
  reach: { status: 'idle' },
  server: { status: 'unset' },
  like: { status: 'idle' },
  createPlaylist: { status: 'idle' },
  mix: { status: 'idle' },
  spotifyCheck: { status: 'idle' },
};

describe('activeJobs (data-model §7)', () => {
  it('lists nothing when every job is idle, done, failed or cancelled', () => {
    expect(activeJobs(IDLE)).toEqual([]);
    expect(
      activeJobs({
        ...IDLE,
        sync: { status: 'error', message: 'x', pending: [] },
        import: { status: 'cancelled', message: 'x' },
        lookup: { status: 'done', found: 1, notFound: 0, total: 1, years: 0 },
        server: {
          status: 'connected',
          lastSyncAt: null,
          usedBytes: null,
        } as JobStates['server'],
      })
    ).toEqual([]);
  });

  it('lists each running job with its label, progress and owner', () => {
    const jobs = activeJobs({
      sync: {
        status: 'running',
        done: 3,
        total: 40,
        current: 'Peak Time Techno',
        pending: [],
      },
      import: { status: 'running', file: 'a.json', index: 1, total: 3 },
      lookup: { status: 'running', pass: 'ids', done: 10, total: 200 },
      rekordbox: { status: 'running', file: 'rb.xml', index: 0, total: 1 },
      reach: {
        status: 'running',
        step: 'listenbrainz',
        done: 5,
        total: 900,
      } as JobStates['reach'],
      server: { status: 'pushing', dataset: 'library', done: 1, total: 4 },
      like: { status: 'liking', playlistId: 'p1', done: 2, total: 9 },
      createPlaylist: {
        status: 'resolving',
        done: 4,
        total: 20,
        mixUrl: 'https://soundcloud.com/a/c',
      },
      mix: { status: 'looking', url: 'https://soundcloud.com/a/b' },
      spotifyCheck: {
        status: 'running',
        url: 'https://soundcloud.com/a/d',
        done: 12,
        total: 40,
        stopping: false,
      },
    });
    expect(jobs).toEqual([
      {
        id: 'sync',
        label: 'Syncing playlists',
        done: 3,
        total: 40,
        href: '#/settings',
      },
      {
        id: 'import',
        label: 'Importing history',
        done: 1,
        total: 3,
        href: '#/import',
      },
      {
        id: 'lookup',
        label: 'Looking up BPM and key',
        done: 10,
        total: 200,
        href: '#/settings',
      },
      {
        id: 'rekordbox',
        label: 'Importing Rekordbox',
        done: 0,
        total: 1,
        href: '#/settings',
      },
      {
        id: 'reach',
        label: 'Looking up artists',
        done: 5,
        total: 900,
        href: '#/settings',
      },
      {
        id: 'server',
        label: 'Saving to server',
        done: 1,
        total: 4,
        href: '#/settings',
      },
      {
        id: 'like',
        label: 'Liking songs',
        done: 2,
        total: 9,
        href: '#/playlist/p1',
      },
      {
        id: 'createPlaylist',
        label: 'Creating playlist',
        done: 4,
        total: 20,
        href: '#/mix/https%3A%2F%2Fsoundcloud.com%2Fa%2Fc',
      },
      {
        id: 'spotifyCheck',
        label: 'Checking on Spotify',
        done: 12,
        total: 40,
        href: '#/mix/https%3A%2F%2Fsoundcloud.com%2Fa%2Fd',
      },
      {
        id: 'mixLookup',
        label: 'Looking up mix',
        done: null,
        total: null,
        href: '#/mix',
      },
    ]);
  });

  it('names the look-up after its pass: release years on the third (round 005)', () => {
    const label = (pass: string) =>
      activeJobs({
        ...IDLE,
        lookup: { status: 'running', pass, done: 1, total: 9 },
      })[0].label;
    expect(label(PASS_BY_ID)).toBe('Looking up BPM and key');
    expect(label(PASS_BY_ISRC)).toBe('Looking up BPM and key');
    expect(label(PASS_YEARS)).toBe('Looking up release years');
  });

  it('names a server pull and the steps without a count', () => {
    const jobs = activeJobs({
      ...IDLE,
      server: { status: 'pulling', dataset: 'mixes', done: 0, total: 0 },
      like: { status: 'checking', playlistId: 'p 2', done: 0, total: 9 },
      createPlaylist: { status: 'adding' },
      spotifyCheck: {
        status: 'finished',
        url: 'x',
        done: 1,
        total: 1,
        stopped: false,
      },
    });
    expect(jobs.map((j) => [j.id, j.label, j.href, j.total])).toEqual([
      ['server', 'Loading from server', '#/settings', 0],
      ['like', 'Liking songs', '#/playlist/p%202', 9],
      ['createPlaylist', 'Creating playlist', '#/mix', null],
    ]);
  });
});
