import { describe, expect, it } from 'vitest';
import type { MixJobView, TracklistRow } from '../../db/schema';
import type { ServerStatus } from '../../server/types';
import {
  jobView,
  mergeWorkerRows,
  requestList,
  requestStatusText,
  resultToRows,
} from './worker';

/** The F15 shape as the worker writes it (data-model.md "Scan result"). */
function resultFixture(over: Record<string, unknown> = {}): unknown {
  return {
    mix_info: {
      title: 'pi⧸live: Someone b2b all night',
      artist: 'Someone',
      audio_filename: 'abc123.webm',
      source_url: 'https://www.youtube.com/watch?v=abc123',
      duration_seconds: 7260,
      date: '2026-11-06',
      track_count: 3,
    },
    tracks: [
      {
        song_name: 'Noble Booth',
        artist: 'Stefan Gubatz',
        time_in_mix: '00:00:00',
        confidence: 86.1,
        duration: null,
        metadata: {
          isrc: 'DECH62001634',
          label: 'Primary Colours',
          shazam_id: '825039928',
          links: {
            shazam: 'https://www.shazam.com/track/825039928/noble-booth',
          },
        },
      },
      {
        song_name: 'Katerina',
        artist: 'Mixxwave',
        time_in_mix: '00:25:50',
        confidence: 97.7,
        duration: null,
        metadata: {
          shazam_id: '836945321',
          links: { shazam: 'javascript:alert(1)' },
        },
      },
      {
        song_name: 'Pep A Cat Up',
        artist: 'Chris Carrier',
        time_in_mix: '01:55:50',
        confidence: 95.1,
        duration: null,
      },
    ],
    ...over,
  };
}

function row(over: Partial<TracklistRow> = {}): TracklistRow {
  return {
    startSec: 0,
    endSec: null,
    artist: 'A',
    title: 'T',
    label: null,
    source: 'tracklistify',
    gap: false,
    detected: { artist: 'A', title: 'T' },
    referenceCount: null,
    confidence: 90,
    isrc: null,
    shazamUrl: null,
    ...over,
  };
}

describe('resultToRows', () => {
  it('turns the worker result into scan rows, keeping ISRC, label and https Shazam links only', () => {
    const r = resultToRows(resultFixture());
    if (!r.ok) throw new Error(r.message);
    expect(r.title).toBe('pi/live: Someone b2b all night');
    expect(r.author).toBe('Someone');
    expect(r.rows).toHaveLength(3);
    expect(r.rows.every((x) => x.source === 'tracklistify')).toBe(true);
    expect(r.rows[0]).toMatchObject({
      artist: 'Stefan Gubatz',
      title: 'Noble Booth',
      startSec: 0,
      isrc: 'DECH62001634',
      label: 'Primary Colours',
      confidence: 86.1,
      shazamUrl: 'https://www.shazam.com/track/825039928/noble-booth',
      detected: { artist: 'Stefan Gubatz', title: 'Noble Booth' },
    });
    expect(r.rows[1].shazamUrl).toBeNull();
    expect(r.rows[1].startSec).toBe(25 * 60 + 50);
    expect(r.rows[2]).toMatchObject({
      isrc: null,
      label: null,
      shazamUrl: null,
    });
    expect('url' in r).toBe(false);
  });
  it('accepts tracks without metadata', () => {
    const r = resultToRows(
      resultFixture({
        tracks: [
          {
            song_name: 'X',
            artist: 'Y',
            time_in_mix: '00:10:00',
            confidence: 80,
          },
        ],
      })
    );
    expect(r.ok && r.rows[0].isrc === null && r.rows[0].label === null).toBe(
      true
    );
  });
  it('refuses an empty tracklist, a wrong shape and a non-object', () => {
    expect(resultToRows(resultFixture({ tracks: [] })).ok).toBe(false);
    expect(
      resultToRows(resultFixture({ tracks: [{ song_name: '', artist: '' }] }))
        .ok
    ).toBe(false);
    expect(resultToRows({ tracks: [] }).ok).toBe(false);
    expect(resultToRows(null).ok).toBe(false);
    expect(resultToRows('text').ok).toBe(false);
  });
  it('reads a non-numeric confidence as null and keeps the row', () => {
    const r = resultToRows(
      resultFixture({
        tracks: [
          {
            song_name: 'X',
            artist: 'Y',
            time_in_mix: '00:00:00',
            confidence: 'high',
          },
          {
            song_name: 'Ok',
            artist: 'Fine',
            time_in_mix: 'noon',
            confidence: 50,
          },
        ],
      })
    );
    if (!r.ok) throw new Error(r.message);
    expect(r.rows.map((x) => x.title)).toEqual(['X', 'Ok']);
    expect(r.rows[0].confidence).toBeNull();
    expect(r.rows[1].startSec).toBeNull();
  });
});

describe('mergeWorkerRows', () => {
  const incoming = [
    row({ startSec: 0, title: 'New1' }),
    row({ startSec: 300, title: 'New2' }),
  ];
  it('replaces untouched scan rows and keeps everything else, ordered by time', () => {
    const existing = [
      row({
        startSec: 0,
        title: 'Old untouched',
        detected: { artist: 'A', title: 'Old untouched' },
      }),
      row({
        startSec: 100,
        title: 'Edited',
        detected: { artist: 'A', title: 'Was' },
      }),
      row({ startSec: 200, title: 'Manual', source: 'manual', detected: null }),
      row({ startSec: 50, title: 'Pasted', source: 'pasted' }),
      row({ startSec: 400, title: 'TrackId', source: 'trackid' }),
      row({ startSec: null, title: 'No time', source: 'pasted' }),
    ];
    const merged = mergeWorkerRows(existing, incoming);
    expect(merged.map((r) => r.title)).toEqual([
      'New1',
      'Pasted',
      'Edited',
      'Manual',
      'New2',
      'TrackId',
      'No time',
    ]);
  });
  it('is stable among equal times and returns incoming as is on an empty list', () => {
    expect(mergeWorkerRows([], incoming)).toEqual(incoming);
    const existing = [
      row({ startSec: 0, title: 'Manual A', source: 'manual', detected: null }),
      row({ startSec: 0, title: 'Manual B', source: 'manual', detected: null }),
    ];
    expect(
      mergeWorkerRows(existing, [row({ startSec: 0, title: 'Scan' })]).map(
        (r) => r.title
      )
    ).toEqual(['Manual A', 'Manual B', 'Scan']);
  });
});

describe('jobView', () => {
  it('maps a validated server row to epoch milliseconds', () => {
    const v = jobView({
      id: '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
      payload: { url: 'https://x.y/z' },
      status: 'claimed',
      claimed_by: 'laptop',
      claimed_at: '2026-11-06T09:40:00.000Z',
      finished_at: null,
      error: null,
      created_at: '2026-11-06T09:12:00.000Z',
      applied_at: null,
    });
    expect(v).toEqual({
      id: '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
      status: 'claimed',
      createdAt: Date.parse('2026-11-06T09:12:00.000Z'),
      claimedBy: 'laptop',
      claimedAt: Date.parse('2026-11-06T09:40:00.000Z'),
      finishedAt: null,
      error: null,
      appliedAt: null,
    });
  });
  it('is null for a row the validator refuses', () => {
    expect(jobView({ id: 'nope' })).toBeNull();
  });
});

describe('requestStatusText', () => {
  const connected: ServerStatus = {
    status: 'connected',
    lastSyncAt: null,
    usedBytes: null,
    stamps: [],
    rejected: 0,
  };
  function view(over: Partial<MixJobView>): MixJobView {
    return {
      id: '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
      status: 'queued',
      createdAt: Date.parse('2026-11-06T09:12:00.000Z'),
      claimedBy: null,
      claimedAt: null,
      finishedAt: null,
      error: null,
      appliedAt: null,
      ...over,
    };
  }
  it('explains every server state that cannot take a request', () => {
    expect(requestStatusText(undefined, { status: 'unset' })).toEqual({
      button: 'Server not set up (Settings)',
      canAsk: false,
      line: null,
    });
    expect(requestStatusText(undefined, { status: 'signedOut' }).button).toBe(
      'Sign in to the server (Settings)'
    );
    expect(
      requestStatusText(undefined, { status: 'offline', message: 'x' }).button
    ).toBe('Server unreachable');
    expect(
      requestStatusText(undefined, {
        status: 'paused',
        dashboardUrl: 'https://d',
      }).button
    ).toBe('Server paused — resume it from the dashboard');
    expect(
      requestStatusText(undefined, { status: 'error', message: 'boom' })
    ).toEqual({
      button: 'Identify on my computer',
      canAsk: true,
      line: null,
    });
    expect(
      requestStatusText(undefined, {
        status: 'pulling',
        dataset: 'library',
        done: 0,
        total: 1,
      }).canAsk
    ).toBe(false);
  });
  it('offers the request when connected and nothing is pending', () => {
    expect(requestStatusText(undefined, connected)).toEqual({
      button: 'Identify on my computer',
      canAsk: true,
      line: null,
    });
  });
  it('describes each request state', () => {
    const queued = requestStatusText(view({}), connected);
    expect(queued.canAsk).toBe(false);
    expect(queued.line).toMatch(/^Waiting for your computer since /);
    const running = requestStatusText(
      view({ status: 'claimed', claimedBy: 'laptop', claimedAt: 1 }),
      connected
    );
    expect(running.canAsk).toBe(false);
    expect(running.line).toMatch(/^Running on laptop since /);
    const done = requestStatusText(
      view({ status: 'done', finishedAt: 2 }),
      connected
    );
    expect(done).toMatchObject({ button: 'Ask again', canAsk: true });
    expect(done.line).toMatch(/^Done /);
    const failed = requestStatusText(
      view({ status: 'failed', finishedAt: 2, error: 'No track identified' }),
      connected
    );
    expect(failed).toMatchObject({ button: 'Ask again', canAsk: true });
    expect(failed.line).toMatch(/^Failed .*: No track identified$/);
    const rejected = requestStatusText(
      view({ status: 'done', finishedAt: 2, rejected: true }),
      connected
    );
    expect(rejected).toEqual({
      button: 'Ask again',
      canAsk: true,
      line: 'Result rejected — ask again',
    });
  });
  it('keeps the server wording over the request state when the server is away', () => {
    const r = requestStatusText(view({ status: 'done', finishedAt: 2 }), {
      status: 'offline',
      message: 'x',
    });
    expect(r.canAsk).toBe(false);
    expect(r.line).toMatch(/^Done /);
  });
});

describe('requestList', () => {
  const connected: ServerStatus = {
    status: 'connected',
    lastSyncAt: null,
    usedBytes: null,
    stamps: [],
    rejected: 0,
  };
  const t = (iso: string) => Date.parse(`2026-11-06T${iso}:00.000Z`);
  function view(over: Partial<MixJobView>): MixJobView {
    return {
      id: '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
      status: 'queued',
      createdAt: t('09:00'),
      claimedBy: null,
      claimedAt: null,
      finishedAt: null,
      error: null,
      appliedAt: null,
      ...over,
    };
  }
  const jobs = {
    'https://soundcloud.com/a/done-set': [
      view({ status: 'done', finishedAt: t('10:00') }),
    ],
    'https://soundcloud.com/a/late-queued': [view({ createdAt: t('11:00') })],
    'https://www.youtube.com/watch?v=x': [
      view({ status: 'failed', finishedAt: t('12:00'), error: 'Boom' }),
      view({ status: 'done', finishedAt: t('08:00') }),
    ],
    'https://soundcloud.com/a/running': [
      view({ status: 'claimed', claimedBy: 'laptop', claimedAt: t('10:30') }),
    ],
    'https://soundcloud.com/a/early-queued': [view({ createdAt: t('09:30') })],
    'https://soundcloud.com/a/empty': [],
  };
  const mixes = [
    {
      url: 'https://soundcloud.com/a/done-set',
      title: 'A set',
      rows: [{}, { gap: true }, {}],
    },
  ];

  it('puts running first, waiting oldest first, then finished newest first', () => {
    const list = requestList(jobs, mixes, connected);
    expect(list.map((i) => i.label)).toEqual([
      'Identifying',
      'Waiting',
      'Waiting',
      'Failed',
      'Done',
    ]);
    expect(list[1]?.key).toBe('https://soundcloud.com/a/early-queued');
    expect(list[3]?.key).toBe('https://www.youtube.com/watch?v=x');
  });

  it('names a saved mix by its title and counts its tracks, else a short link', () => {
    const list = requestList(jobs, mixes, connected);
    const done = list.find((i) => i.label === 'Done');
    expect(done).toMatchObject({ title: 'A set', tracks: 2, saved: true });
    const running = list[0];
    expect(running).toMatchObject({
      title: 'soundcloud.com · running',
      tracks: null,
      saved: false,
    });
    expect(running?.line).toContain('Running on laptop');
    expect(list[3]?.title).toBe('youtube.com · watch');
  });

  it('offers Ask again on a failed or rejected request only, and only when the server can take it', () => {
    const list = requestList(jobs, mixes, connected);
    expect(list.filter((i) => i.canAskAgain).map((i) => i.label)).toEqual([
      'Failed',
    ]);
    const rejected = requestList(
      { k: [view({ status: 'done', rejected: true })] },
      [],
      connected
    );
    expect(rejected[0]).toMatchObject({ label: 'Rejected', canAskAgain: true });
    const offline = requestList(jobs, mixes, {
      status: 'offline',
      message: 'x',
    });
    expect(offline.some((i) => i.canAskAgain)).toBe(false);
  });
});
