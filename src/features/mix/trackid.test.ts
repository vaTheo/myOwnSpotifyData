import { describe, expect, it, vi } from 'vitest';
import { parseClock } from './parse';
import {
  MIX_GAP_MIN_SEC,
  MIX_MERGE_TOLERANCE_SEC,
  TRACKID_INTERVAL_MS,
  fetchTrackId,
  tidSpansToRows,
  trackidDetailUrl,
  trackidListUrl,
} from './trackid';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const URL = 'https://soundcloud.com/xlr8r/exclusive-shonky-may-mix';
const SLUG = 'exclusive-shonky-may-mix-by-xlr8r';
/** The probe's mix duration, fractional seconds and all (spec §3.3). */
const DURATION = '03:10:37.1910000';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function span(
  musicTrackId: string,
  startTime: string,
  endTime: string,
  over: Record<string, unknown> = {}
) {
  return {
    id: `s-${startTime}`,
    musicTrackId,
    startTime,
    endTime,
    artist: 'Artist',
    title: 'Title',
    label: null,
    referenceCount: 1,
    ...over,
  };
}

/**
 * The detail record, built from the two discriminating pairs of §3.3 step 2:
 * process 1 holds the identifiable tracks and a reprocess holds the Apollonia
 * continuation; the Pierre Codarin track is played twice, two hours apart.
 */
function detailRecord() {
  return {
    url: URL,
    slug: SLUG,
    duration: DURATION,
    trackCount: 0, // the detail says 0; it must never be the count.
    detectionProcesses: [
      {
        detectionProcessMusicTracks: [
          span('m-shonky', '00:11:44', '00:16:16', {
            artist: 'Shonky',
            title: 'Track A',
            label: 'Label A',
            referenceCount: 42,
          }),
          span('m-pc', '00:39:40', '00:43:20', {
            artist: 'Pierre Codarin',
            title: 'Jazzed My Table',
            referenceCount: 3,
          }),
          span('m-ap', '02:37:32', '02:39:40', {
            artist: 'Apollonia',
            title: 'Chez Michel',
            referenceCount: 7,
          }),
          span('m-pc', '02:55:19', '02:57:00', {
            artist: 'Pierre Codarin',
            title: 'Jazzed My Table',
            referenceCount: 3,
          }),
          // startTime is not a clock: dropped, never placed at zero.
          span('m-bad', 'soon', 'later', { artist: 'X', title: 'Y' }),
        ],
      },
      {
        detectionProcessMusicTracks: [
          span('m-ap', '02:39:41', '02:42:00', {
            artist: 'Apollonia',
            title: 'Chez Michel',
            referenceCount: 7,
          }),
        ],
      },
    ],
  };
}

function listBody(over: Record<string, unknown> = {}, rowCount = 1) {
  return {
    result: {
      rowCount,
      audiostreams: [
        {
          id: 'a1',
          url: URL,
          slug: SLUG,
          title: 'Exclusive: Shonky - May Mix by XLR8R',
          channel: 'XLR8R',
          duration: DURATION,
          trackCount: 16, // the list says 16; it must never be the count.
          timeHitRate: 0.3263038975216904,
          detectionProcesses: [], // spans are empty in the list response.
          ...over,
        },
      ],
    },
  };
}

function setup(responses: Array<() => Response | Promise<Response>>) {
  const fetchFn = vi.fn<FetchLike>(async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra request');
    return next();
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  return { fetchFn, fetchArg: fetchFn as unknown as typeof fetch, sleep };
}

describe('tidSpansToRows', () => {
  const rows = tidSpansToRows(detailRecord(), parseClock(DURATION));
  const identified = rows.filter((r) => !r.gap);

  it('identifies four tracks, not the list 16 or the detail 0', () => {
    expect(identified).toHaveLength(4);
  });

  it('holds more rows than tracks, because gap rows share the array', () => {
    // head + 3 between + tail = 5 gaps, plus the 4 identified.
    expect(rows.length).toBeGreaterThan(identified.length);
    expect(rows).toHaveLength(9);
  });

  it('drops the span whose startTime is not a clock', () => {
    expect(identified.some((r) => r.title === 'Y')).toBe(false);
  });

  it('merges the Apollonia reprocess continuation into one row', () => {
    const ap = identified.filter((r) => r.title === 'Chez Michel');
    expect(ap).toHaveLength(1);
    // 02:37:32 in process 1, 02:42:00 in the reprocess (a 1 s gap abuts).
    expect(ap[0].startSec).toBe(9452);
    expect(ap[0].endSec).toBe(9720);
  });

  it('keeps the Pierre Codarin replay as two rows, two hours apart', () => {
    const pc = identified.filter((r) => r.title === 'Jazzed My Table');
    expect(pc.map((r) => r.startSec)).toEqual([2380, 10519]);
  });

  it('sorts rows ascending by start and stamps identified rows', () => {
    const starts = rows.map((r) => r.startSec ?? -1);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    const shonky = identified[0];
    expect(shonky).toMatchObject({
      startSec: 704,
      endSec: 976,
      artist: 'Shonky',
      title: 'Track A',
      label: 'Label A',
      source: 'trackid',
      gap: false,
      detected: { artist: 'Shonky', title: 'Track A' },
      referenceCount: 42,
    });
  });

  it('emits a head gap and a tail gap keyed to the known duration', () => {
    const head = rows[0];
    expect(head).toMatchObject({ gap: true, startSec: 0, endSec: 704 });
    const tail = rows[rows.length - 1];
    expect(tail.gap).toBe(true);
    expect(tail.startSec).toBe(10620);
    expect(tail.endSec).toBe(parseClock(DURATION));
  });

  it('returns [] for a known mix with no identified span, not one giant gap', () => {
    const empty = {
      duration: DURATION,
      detectionProcesses: [{ detectionProcessMusicTracks: [] }],
    };
    expect(tidSpansToRows(empty, parseClock(DURATION))).toEqual([]);
  });

  it('emits no tail gap when the duration is unknown', () => {
    const rec = {
      detectionProcesses: [
        { detectionProcessMusicTracks: [span('x', '0:10', '1:40')] },
      ],
    };
    const out = tidSpansToRows(rec, null);
    expect(out.filter((r) => r.gap)).toHaveLength(0);
  });

  it('gaps on a stretch of MIX_GAP_MIN_SEC but not one second under', () => {
    const under = tidSpansToRows(
      {
        detectionProcesses: [
          { detectionProcessMusicTracks: [span('x', '0:59', '2:00')] },
        ],
      },
      null
    );
    expect(under[0].gap).toBe(false); // starts at 59 s: no head gap.
    const at = tidSpansToRows(
      {
        detectionProcesses: [
          { detectionProcessMusicTracks: [span('x', '1:00', '2:00')] },
        ],
      },
      null
    );
    expect(at[0]).toMatchObject({
      gap: true,
      startSec: 0,
      endSec: MIX_GAP_MIN_SEC,
    });
  });

  it('merges within MIX_MERGE_TOLERANCE_SEC and splits one second beyond', () => {
    const abut = tidSpansToRows(
      {
        detectionProcesses: [
          {
            detectionProcessMusicTracks: [
              span('x', '0:10', '1:40'),
              span('x', '1:45', '2:00'), // start 105 = end 100 + tolerance
            ],
          },
        ],
      },
      null
    );
    expect(abut.filter((r) => !r.gap)).toHaveLength(1);
    expect(abut[0].endSec).toBe(120);
    const apart = tidSpansToRows(
      {
        detectionProcesses: [
          {
            detectionProcessMusicTracks: [
              span('x', '0:10', '1:40'),
              span('x', '1:46', '2:00'), // start 106 = end 100 + tolerance + 1
            ],
          },
        ],
      },
      null
    );
    expect(apart.filter((r) => !r.gap)).toHaveLength(2);
    expect(MIX_MERGE_TOLERANCE_SEC).toBe(5);
  });

  it('I1: does not merge two adjacent spans with different numeric musicTrackIds', () => {
    // Real TrackId ids are numbers (idTypes: ["number"]). Before the fix,
    // `str()` coerced every numeric id to '', so any two spans this close
    // (abutting well within MIX_MERGE_TOLERANCE_SEC) merged into one row and
    // silently dropped Artist B.
    const rows = tidSpansToRows(
      {
        detectionProcesses: [
          {
            detectionProcessMusicTracks: [
              span('unused', '0:10', '1:40', {
                musicTrackId: 111,
                artist: 'Artist A',
                title: 'Track A',
              }),
              span('unused', '1:41', '2:00', {
                musicTrackId: 222,
                artist: 'Artist B',
                title: 'Track B',
              }),
            ],
          },
        ],
      },
      null
    ).filter((r) => !r.gap);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.artist)).toEqual(['Artist A', 'Artist B']);
    expect(rows.map((r) => r.title)).toEqual(['Track A', 'Track B']);
  });

  it('I1: merges two spans that share one numeric musicTrackId and abut', () => {
    const rows = tidSpansToRows(
      {
        detectionProcesses: [
          {
            detectionProcessMusicTracks: [
              span('unused', '0:10', '1:40', {
                musicTrackId: 42,
                artist: 'Same Artist',
                title: 'Same Track',
              }),
              span('unused', '1:41', '2:00', {
                musicTrackId: 42,
                artist: 'Same Artist',
                title: 'Same Track',
              }),
            ],
          },
        ],
      },
      null
    ).filter((r) => !r.gap);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ startSec: 10, endSec: 120 });
  });

  it('I1: never merges two spans that both lack a musicTrackId, even abutting', () => {
    const rows = tidSpansToRows(
      {
        detectionProcesses: [
          {
            detectionProcessMusicTracks: [
              span('', '0:10', '1:40', { artist: 'A', title: 'One' }),
              span('', '1:41', '2:00', { artist: 'B', title: 'Two' }),
            ],
          },
        ],
      },
      null
    ).filter((r) => !r.gap);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.title)).toEqual(['One', 'Two']);
  });

  it('M4: drops a span whose endTime is before its startTime', () => {
    const rows = tidSpansToRows(
      {
        detectionProcesses: [
          {
            detectionProcessMusicTracks: [
              span('bad', '2:00', '1:00', {
                musicTrackId: 5,
                artist: 'Bad',
                title: 'Reversed',
              }),
              span('good', '3:00', '4:00', {
                musicTrackId: 6,
                artist: 'Good',
                title: 'Track',
              }),
            ],
          },
        ],
      },
      null
    ).filter((r) => !r.gap);
    expect(rows).toHaveLength(1);
    expect(rows[0].artist).toBe('Good');
  });

  it('M4: keeps a zero-length span (endSec === startSec)', () => {
    const rows = tidSpansToRows(
      {
        detectionProcesses: [
          {
            detectionProcessMusicTracks: [
              span('zero', '1:00', '1:00', { musicTrackId: 7 }),
            ],
          },
        ],
      },
      null
    ).filter((r) => !r.gap);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ startSec: 60, endSec: 60 });
  });

  it('M3: anchors a following gap on the running max end, not the last-by-start span', () => {
    // A (id 1) starts first but, as a longer crossfaded track, ends LAST.
    // B (id 2) starts after A and ends well before it — contained inside A's
    // span. `merged` is sorted by start, so B is last-by-start even though
    // its end (100 s) is well before A's true end (200 s).
    const rows = tidSpansToRows(
      {
        detectionProcesses: [
          {
            detectionProcessMusicTracks: [
              span('unused', '0:00', '3:20', {
                musicTrackId: 1,
                artist: 'A',
                title: 'Long',
              }),
              span('unused', '0:50', '1:40', {
                musicTrackId: 2,
                artist: 'B',
                title: 'Short',
              }),
            ],
          },
        ],
      },
      300 // 5:00 duration
    );
    const identified = rows.filter((r) => !r.gap);
    expect(identified).toHaveLength(2);
    // No phantom/mis-anchored gap between A and B: B starts inside A's span.
    expect(rows.some((r) => r.gap && r.startSec !== 200)).toBe(false);
    const tail = rows[rows.length - 1];
    expect(tail.gap).toBe(true);
    // True last end is A's 200 s, not B's last-by-start endSec of 100 s (the
    // pre-fix value, which would wrongly claim 100-200 s as an unidentified
    // gap even though A covers it).
    expect(tail.startSec).toBe(200);
    expect(tail.endSec).toBe(300);
  });
});

describe('fetchTrackId — the guard', () => {
  it('rejects rowCount 0 as notFound and never issues the detail call', async () => {
    const { fetchArg, fetchFn, sleep } = setup([
      () => json({ result: { rowCount: 0, audiostreams: [] } }),
    ]);
    expect(await fetchTrackId(fetchArg, URL, sleep)).toEqual({
      status: 'notFound',
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('rejects rowCount > 1 as notFound, never falling back to the first record', async () => {
    const many = {
      result: {
        rowCount: 2,
        audiostreams: [
          { url: URL, slug: SLUG },
          { url: 'https://soundcloud.com/other/mix', slug: 'other' },
        ],
      },
    };
    const { fetchArg, fetchFn } = setup([() => json(many)]);
    expect(await fetchTrackId(fetchArg, URL)).toEqual({ status: 'notFound' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('rejects a rowCount 1 record whose url does not match', async () => {
    const { fetchArg } = setup([
      () => json(listBody({ url: 'https://soundcloud.com/xlr8r/other-mix' })),
    ]);
    expect(await fetchTrackId(fetchArg, URL)).toEqual({ status: 'notFound' });
  });
});

describe('fetchTrackId — the two-step flow', () => {
  it('reads the slug from the validated record and fetches the spans by slug', async () => {
    const { fetchArg, fetchFn, sleep } = setup([
      () => json(listBody()),
      () => json({ result: detailRecord() }),
    ]);
    const result = await fetchTrackId(fetchArg, URL, sleep);
    // The detail call uses the record's slug, not the permalink's last segment.
    expect(fetchFn.mock.calls[0][0]).toBe(trackidListUrl(URL));
    expect(fetchFn.mock.calls[1][0]).toBe(trackidDetailUrl(SLUG));
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([TRACKID_INTERVAL_MS]);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.slug).toBe(SLUG);
    expect(result.title).toBe('Exclusive: Shonky - May Mix by XLR8R');
    expect(result.channel).toBe('XLR8R');
    expect(result.durationSec).toBe(parseClock(DURATION));
    expect(result.timeHitRate).toBe(0.3263038975216904);
    // The identified count is the non-gap rows, never trackCount 16 or 0.
    expect(result.rows.filter((r) => !r.gap)).toHaveLength(4);
    expect(result.rows.length).toBeGreaterThan(4);
  });

  it('does not set credentials on either request', async () => {
    const { fetchArg, fetchFn } = setup([
      () => json(listBody()),
      () => json({ result: detailRecord() }),
    ]);
    await fetchTrackId(fetchArg, URL);
    expect(fetchFn.mock.calls[0][1]?.credentials).toBeUndefined();
    expect(fetchFn.mock.calls[1][1]?.credentials).toBeUndefined();
  });

  it('is notFound when the detail record url mismatches', async () => {
    const { fetchArg } = setup([
      () => json(listBody()),
      () =>
        json({
          result: { ...detailRecord(), url: 'https://soundcloud.com/x/y' },
        }),
    ]);
    expect(await fetchTrackId(fetchArg, URL)).toEqual({ status: 'notFound' });
  });

  it('is notFound when the detail record slug mismatches', async () => {
    const { fetchArg } = setup([
      () => json(listBody()),
      () => json({ result: { ...detailRecord(), slug: 'a-different-slug' } }),
    ]);
    expect(await fetchTrackId(fetchArg, URL)).toEqual({ status: 'notFound' });
  });

  it('returns ok with rows [] for a known mix that identified nothing', async () => {
    const emptyDetail = {
      result: {
        url: URL,
        slug: SLUG,
        duration: DURATION,
        detectionProcesses: [{ detectionProcessMusicTracks: [] }],
      },
    };
    const { fetchArg } = setup([
      () => json(listBody()),
      () => json(emptyDetail),
    ]);
    const result = await fetchTrackId(fetchArg, URL);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.rows).toEqual([]);
  });
});

describe('fetchTrackId — error arms', () => {
  it('is error, not notFound, when the list call is a non-2xx', async () => {
    const { fetchArg } = setup([() => json({}, 500)]);
    expect(await fetchTrackId(fetchArg, URL)).toEqual({
      status: 'error',
      message: 'HTTP 500',
    });
  });

  it('is error when the list transport throws', async () => {
    const { fetchArg } = setup([
      () => Promise.reject(new TypeError('Failed to fetch')),
    ]);
    const result = await fetchTrackId(fetchArg, URL);
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.message).toBe('Failed to fetch');
  });

  it('is error when the list body is not JSON', async () => {
    const { fetchArg } = setup([
      () =>
        new Response('<html/>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
    ]);
    expect((await fetchTrackId(fetchArg, URL)).status).toBe('error');
  });

  it('is error when the detail call is a non-2xx', async () => {
    const { fetchArg } = setup([() => json(listBody()), () => json({}, 500)]);
    expect(await fetchTrackId(fetchArg, URL)).toEqual({
      status: 'error',
      message: 'HTTP 500',
    });
  });
});
