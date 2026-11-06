import { describe, expect, it } from 'vitest';
import type { MixJobView, TracklistRow } from '../../db/schema';
import type { ServerStatus } from '../../server/types';
import {
  jobView,
  mergeWorkerRows,
  requestList,
  viewRows,
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

describe('resultToRows — round 003 additions', () => {
  const base = resultFixture() as {
    mix_info: Record<string, unknown>;
    tracks: Record<string, unknown>[];
  };
  function with3(): unknown {
    return {
      mix_info: {
        ...base.mix_info,
        second_pass: { places: 9, found: 1, stopped: null },
        gaps: [
          {
            start: 600,
            end: 900,
            clues: [
              { at: 610.4, author: 'x', text: 'ID? <b>', kind: 'comment' },
              { at: 'later', author: 'y', text: 'bad', kind: 'comment' },
            ],
          },
          { start: 1000, end: 1015, clues: [] },
        ],
        clues: [
          { at: null, author: 'dj', text: 'B - C', kind: 'description' },
          { at: null, author: 'dj', text: 'x'.repeat(1500), kind: 'comment' },
          { at: null, author: 'dj', text: 'nope', kind: 'html' },
        ],
      },
      tracks: [
        { ...base.tracks[0], origin: 'replay', speed_percent: 4 },
        { song_name: '', artist: '' },
        ...base.tracks.slice(1),
        {
          song_name: 'Leave Home (Edit Select Remix)',
          artist: 'Space Above',
          time_in_mix: null,
          origin: 'clue',
          clue: {
            at: null,
            author: 'dj',
            text: 'Space Above - Leave Home',
            kind: 'comment',
          },
          metadata: { isrc: 'NLCK41072412' },
        },
      ],
    };
  }

  it('marks replays and candidates, builds gap rows with their clues, keeps set-wide clues', () => {
    const r = resultToRows(with3());
    if (!r.ok) throw new Error(r.message);
    expect(r.rows[0]).toMatchObject({ origin: 'replay', speedPercent: 4 });
    const candidate = r.rows.find((x) => x.origin === 'clue');
    expect(candidate).toMatchObject({
      artist: 'Space Above',
      isrc: 'NLCK41072412',
      startSec: null,
      clue: { atSec: null, kind: 'comment' },
    });
    expect(r.rows[r.rows.length - 1]).toBe(candidate); // no time: last
    const gaps = r.rows.filter((x) => x.gap);
    expect(gaps).toHaveLength(1); // the gap without clues is left out
    expect(gaps[0]).toMatchObject({ startSec: 600, endSec: 900 });
    expect(gaps[0].clues).toEqual([
      { atSec: 610.4, author: 'x', text: 'ID? <b>', kind: 'comment' },
    ]);
    expect(r.clues.map((c) => c.text.length)).toEqual([5, 1000]);
  });

  it('a result without additions reads as before', () => {
    const r = resultToRows(resultFixture());
    if (!r.ok) throw new Error(r.message);
    expect(r.rows.some((x) => x.origin !== undefined || x.gap)).toBe(false);
    expect(r.clues).toEqual([]);
  });
});

describe('requestStatusText — stopped early', () => {
  it("shows the worker's note next to Done", () => {
    const line = requestStatusText(
      {
        id: 'x',
        status: 'done',
        createdAt: 0,
        claimedBy: null,
        claimedAt: null,
        finishedAt: Date.parse('2026-11-06T16:00:00Z'),
        error:
          'Stopped early at 00:47:00 (rate limited); ask again later for the rest',
        appliedAt: null,
      },
      {
        status: 'connected',
        lastSyncAt: null,
        usedBytes: null,
        stamps: [],
        rejected: 0,
      }
    ).line;
    expect(line).toMatch(
      /^Done .* · Stopped early at 00:47:00 \(rate limited\)/
    );
  });
});

describe('resultToRows — round 004 clip count', () => {
  it('keeps hits on heard rows, never on candidates, and refuses bad values', () => {
    const base = resultFixture() as {
      mix_info: unknown;
      tracks: Record<string, unknown>[];
    };
    const r = resultToRows({
      ...base,
      tracks: [
        { ...base.tracks[0], hits: 5 },
        { ...base.tracks[1], hits: 0 },
        { ...base.tracks[2], origin: 'replay', speed_percent: -4, hits: 1 },
        {
          song_name: 'C',
          artist: 'B',
          time_in_mix: null,
          origin: 'clue',
          hits: 3,
          clue: { at: null, author: 'dj', text: 'B - C', kind: 'description' },
        },
      ],
    });
    if (!r.ok) throw new Error(r.message);
    const byTitle = (t: string) => r.rows.find((x) => x.title === t);
    expect(byTitle(String(base.tracks[0].song_name))?.hits).toBe(5);
    expect(byTitle(String(base.tracks[1].song_name))?.hits).toBeUndefined();
    expect(byTitle(String(base.tracks[2].song_name))).toMatchObject({
      origin: 'replay',
      hits: 1,
    });
    expect(byTitle('C')?.hits).toBeUndefined();
  });
});

describe('viewRows', () => {
  const r = (over: Partial<TracklistRow>): TracklistRow => ({
    startSec: 0,
    endSec: null,
    artist: 'A',
    title: 'T',
    label: null,
    source: 'tracklistify',
    gap: false,
    detected: { artist: 'A', title: 'T' },
    referenceCount: null,
    ...over,
  });
  const rows = [
    r({ hits: 1, confidence: 63 }),
    r({ hits: 5, confidence: 91 }),
    r({ origin: 'clue' }),
    r({ hits: 1, confidence: 97 }),
  ];
  it('keeps set order by default and filters heard-once without touching the rows', () => {
    expect(viewRows(rows, 'time', false)).toEqual([0, 1, 2, 3]);
    expect(viewRows(rows, 'time', true)).toEqual([0, 3]);
  });
  it('sorts by clips or best score, rows without the number last', () => {
    expect(viewRows(rows, 'clips', false)).toEqual([1, 0, 3, 2]);
    expect(viewRows(rows, 'score', false)).toEqual([3, 1, 0, 2]);
  });
});
