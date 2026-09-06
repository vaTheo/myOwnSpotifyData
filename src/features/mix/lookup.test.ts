import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TracklistRow } from '../../db/schema';
import { fetchOembed, type OembedResult } from './oembed';
import { fetchTrackId, type TrackIdResult } from './trackid';
import {
  editTracklistRow,
  hasManualRows,
  lookupMix,
  type MixDeps,
} from './lookup';

vi.mock('./oembed', () => ({ fetchOembed: vi.fn() }));
vi.mock('./trackid', () => ({ fetchTrackId: vi.fn() }));

const oembedMock = vi.mocked(fetchOembed);
const trackidMock = vi.mocked(fetchTrackId);

const deps: MixDeps = {
  fetchFn: vi.fn() as unknown as typeof fetch,
  sleep: () => Promise.resolve(),
};

const NORM = 'https://soundcloud.com/xlr8r/shonky-may-mix';

const okOembed: OembedResult = {
  status: 'ok',
  title: 'Exclusive: Shonky - May Mix by XLR8R',
  author: 'XLR8R',
  authorUrl: 'https://soundcloud.com/xlr8r',
  description: '1. A - B\n2. C - D',
  playerSrc: 'https://w.soundcloud.com/player/?url=x',
};
const idRow: TracklistRow = {
  startSec: 0,
  endSec: 60,
  artist: 'Apollonia',
  title: 'Chez Michel',
  label: null,
  source: 'trackid',
  gap: false,
  detected: { artist: 'Apollonia', title: 'Chez Michel' },
  referenceCount: 5,
};
const okTrackid: TrackIdResult = {
  status: 'ok',
  slug: 'shonky-may-mix',
  title: 'Shonky May Mix',
  channel: 'XLR8R',
  durationSec: 3600,
  timeHitRate: 0.3263,
  rows: [idRow],
};

beforeEach(() => {
  oembedMock.mockReset();
  trackidMock.mockReset();
});

describe('lookupMix (permalink)', () => {
  it('runs both arms and returns each result verbatim, resolvedUrl = input', async () => {
    oembedMock.mockResolvedValue(okOembed);
    trackidMock.mockResolvedValue(okTrackid);
    const result = await lookupMix(deps, { kind: 'permalink', url: NORM });
    expect(oembedMock).toHaveBeenCalledWith(deps.fetchFn, NORM);
    expect(trackidMock).toHaveBeenCalledWith(deps.fetchFn, NORM, deps.sleep);
    expect(result).toEqual({
      oembed: okOembed,
      trackid: okTrackid,
      resolvedUrl: NORM,
    });
  });

  it('keeps the TrackId rows when oEmbed errors — one failure cannot hide the other', async () => {
    oembedMock.mockResolvedValue({ status: 'error', message: 'network down' });
    trackidMock.mockResolvedValue(okTrackid);
    const result = await lookupMix(deps, { kind: 'permalink', url: NORM });
    expect(result.oembed).toEqual({ status: 'error', message: 'network down' });
    expect(result.trackid).toEqual(okTrackid);
  });

  it('returns two error arms when both layers fail, and does not throw', async () => {
    oembedMock.mockResolvedValue({ status: 'error', message: 'oembed boom' });
    trackidMock.mockResolvedValue({ status: 'error', message: 'trackid boom' });
    await expect(
      lookupMix(deps, { kind: 'permalink', url: NORM })
    ).resolves.toEqual({
      oembed: { status: 'error', message: 'oembed boom' },
      trackid: { status: 'error', message: 'trackid boom' },
      resolvedUrl: NORM,
    });
  });
});

describe('lookupMix (short link)', () => {
  const SHORT = 'https://on.soundcloud.com/IPnhLSLBYZqoFYpagL';
  // The REAL oEmbed shape (verified 2026-09-06): the title carries the
  // " by The Lot Radio" suffix, which permalinkFromOembed strips using
  // `author` so the candidate matches the real permalink. permalinkFromOembed
  // is the real function here (only oembed and trackid are mocked).
  const shortOembed: OembedResult = {
    status: 'ok',
    title: 'Naone @ The Lot Radio 01-11-2025 by The Lot Radio',
    author: 'The Lot Radio',
    authorUrl: 'https://soundcloud.com/thelotradio',
    description: '',
    playerSrc: 'https://w.soundcloud.com/player/?url=y',
  };
  const CANDIDATE =
    'https://soundcloud.com/thelotradio/naone-the-lot-radio-01-11-2025';

  it('resolves via oEmbed, then queries TrackId on the derived candidate (guarded hit)', async () => {
    oembedMock.mockResolvedValue(shortOembed);
    trackidMock.mockResolvedValue(okTrackid);
    const result = await lookupMix(deps, { kind: 'shortlink', url: SHORT });
    // oEmbed runs on the short link itself (SoundCloud resolves it).
    expect(oembedMock).toHaveBeenCalledWith(deps.fetchFn, SHORT);
    // TrackId runs on the reconstructed permalink, never the short link.
    expect(trackidMock).toHaveBeenCalledWith(
      deps.fetchFn,
      CANDIDATE,
      deps.sleep
    );
    expect(result).toEqual({
      oembed: shortOembed,
      trackid: okTrackid,
      resolvedUrl: CANDIDATE,
    });
  });

  it('keeps oEmbed ok with trackid notFound when the candidate does not match the guard', async () => {
    oembedMock.mockResolvedValue(shortOembed);
    trackidMock.mockResolvedValue({ status: 'notFound' });
    const result = await lookupMix(deps, { kind: 'shortlink', url: SHORT });
    expect(trackidMock).toHaveBeenCalledWith(
      deps.fetchFn,
      CANDIDATE,
      deps.sleep
    );
    expect(result.oembed).toEqual(shortOembed);
    expect(result.trackid).toEqual({ status: 'notFound' });
    expect(result.resolvedUrl).toBe(CANDIDATE);
  });

  it('never calls TrackId when oEmbed fails on the short link', async () => {
    oembedMock.mockResolvedValue({ status: 'error', message: 'boom' });
    const result = await lookupMix(deps, { kind: 'shortlink', url: SHORT });
    expect(trackidMock).not.toHaveBeenCalled();
    expect(result.trackid).toEqual({ status: 'notFound' });
    expect(result.resolvedUrl).toBeNull();
  });

  // An apostrophe title yields two candidates: the dropped-apostrophe spelling
  // first, the apostrophe-as-hyphen spelling second (permalinkCandidates is the
  // real function here — only oembed and trackid are mocked).
  const apostropheOembed: OembedResult = {
    status: 'ok',
    title: "Don't Stop",
    author: 'DJ X',
    authorUrl: 'https://soundcloud.com/dj',
    description: '',
    playerSrc: null,
  };
  const C1 = 'https://soundcloud.com/dj/dont-stop';
  const C2 = 'https://soundcloud.com/dj/don-t-stop';

  it('probes candidates in order and resolves via the 2nd when only it matches', async () => {
    oembedMock.mockResolvedValue(apostropheOembed);
    // The guard only confirms the 2nd spelling; the 1st is a notFound miss.
    trackidMock.mockImplementation((_fn, url): Promise<TrackIdResult> =>
      Promise.resolve(url === C2 ? okTrackid : { status: 'notFound' })
    );
    const result = await lookupMix(deps, { kind: 'shortlink', url: SHORT });
    expect(trackidMock).toHaveBeenCalledTimes(2);
    expect(trackidMock.mock.calls[0][1]).toBe(C1);
    expect(trackidMock.mock.calls[1][1]).toBe(C2);
    expect(result.trackid).toEqual(okTrackid);
    expect(result.resolvedUrl).toBe(C2);
    expect(result.oembed).toEqual(apostropheOembed);
  });

  it('falls back to the first candidate when NO candidate matches the guard', async () => {
    oembedMock.mockResolvedValue(apostropheOembed);
    trackidMock.mockResolvedValue({ status: 'notFound' });
    const result = await lookupMix(deps, { kind: 'shortlink', url: SHORT });
    expect(trackidMock).toHaveBeenCalledTimes(2);
    expect(result.trackid).toEqual({ status: 'notFound' });
    expect(result.resolvedUrl).toBe(C1);
    expect(result.oembed.status).toBe('ok');
  });

  it('stops after the first candidate when it is confirmed (no wasted probes)', async () => {
    oembedMock.mockResolvedValue(apostropheOembed);
    // Confirm only the 1st spelling: the loop must stop before probing the 2nd.
    trackidMock.mockImplementation((_fn, url): Promise<TrackIdResult> =>
      Promise.resolve(url === C1 ? okTrackid : { status: 'notFound' })
    );
    const result = await lookupMix(deps, { kind: 'shortlink', url: SHORT });
    expect(trackidMock).toHaveBeenCalledTimes(1);
    expect(trackidMock.mock.calls[0][1]).toBe(C1);
    expect(result.resolvedUrl).toBe(C1);
    expect(result.trackid).toEqual(okTrackid);
  });

  it('surfaces a transport error rather than disguising it as notFound', async () => {
    oembedMock.mockResolvedValue(apostropheOembed);
    // Both candidates hit a service error: the failure must be shown, not
    // swallowed into a "not in the corpus" notFound.
    trackidMock.mockResolvedValue({ status: 'error', message: 'HTTP 503' });
    const result = await lookupMix(deps, { kind: 'shortlink', url: SHORT });
    expect(trackidMock).toHaveBeenCalledTimes(2);
    expect(result.trackid).toEqual({ status: 'error', message: 'HTTP 503' });
    expect(result.resolvedUrl).toBe(C1);
  });
});

describe('editTracklistRow', () => {
  const base: TracklistRow = {
    startSec: 0,
    endSec: 60,
    artist: 'Apollonia',
    title: 'Chez Michel',
    label: null,
    source: 'trackid',
    gap: false,
    detected: { artist: 'Apollonia', title: 'Chez Michel' },
    referenceCount: 5,
  };

  it('keeps the source when the values still equal detected (a label-only edit)', () => {
    const out = editTracklistRow(base, {
      artist: 'Apollonia',
      title: 'Chez Michel',
      label: 'Ovum',
    });
    expect(out.source).toBe('trackid');
    expect(out.label).toBe('Ovum');
    expect(out.detected).toEqual({ artist: 'Apollonia', title: 'Chez Michel' });
  });

  it('flips the source to manual when a value now differs, keeping detected', () => {
    const out = editTracklistRow(base, {
      artist: 'Apollonia',
      title: 'Chez Michelle',
      label: '',
    });
    expect(out.source).toBe('manual');
    expect(out.title).toBe('Chez Michelle');
    expect(out.detected).toEqual({ artist: 'Apollonia', title: 'Chez Michel' });
    expect(out.label).toBeNull();
  });

  it('leaves an added row (detected null) manual', () => {
    const added: TracklistRow = { ...base, source: 'manual', detected: null };
    const out = editTracklistRow(added, { artist: 'X', title: 'Y', label: '' });
    expect(out.source).toBe('manual');
  });

  it('leaves startSec alone when the patch omits it (M5)', () => {
    const out = editTracklistRow(base, {
      artist: 'Apollonia',
      title: 'Chez Michel',
      label: '',
    });
    expect(out.startSec).toBe(0);
  });

  it('sets startSec from the patch, on a row that had none (M5)', () => {
    const untimed: TracklistRow = { ...base, startSec: null, source: 'manual' };
    const out = editTracklistRow(untimed, {
      artist: 'Apollonia',
      title: 'Chez Michel',
      label: '',
      startSec: 90,
    });
    expect(out.startSec).toBe(90);
  });

  it('clears startSec when the patch passes null (an emptied time field)', () => {
    const out = editTracklistRow(base, {
      artist: 'Apollonia',
      title: 'Chez Michel',
      label: '',
      startSec: null,
    });
    expect(out.startSec).toBeNull();
  });

  it('flips source to manual when only the time genuinely changes', () => {
    // A retimed-only row must count as curated too: hasManualRows (and so
    // the I2/§8 replace-guards) key off source === 'manual', and a
    // time-only edit would otherwise be invisible to "Look up again".
    const out = editTracklistRow(base, {
      artist: 'Apollonia',
      title: 'Chez Michel',
      label: '',
      startSec: 45, // base.startSec is 0: a real change.
    });
    expect(out.source).toBe('manual');
    expect(hasManualRows([out])).toBe(true);
  });

  it('does not flip source when the same time is resubmitted unchanged', () => {
    const out = editTracklistRow(base, {
      artist: 'Apollonia',
      title: 'Chez Michel',
      label: '',
      startSec: 0, // same as base.startSec: no real change.
    });
    expect(out.source).toBe('trackid');
  });
});

describe('hasManualRows', () => {
  it('is true when any row is manual, false otherwise', () => {
    const clean: TracklistRow = {
      startSec: null,
      endSec: null,
      artist: 'A',
      title: 'B',
      label: null,
      source: 'trackid',
      gap: false,
      detected: { artist: 'A', title: 'B' },
      referenceCount: null,
    };
    expect(hasManualRows([clean])).toBe(false);
    expect(hasManualRows([clean, { ...clean, source: 'manual' }])).toBe(true);
  });
});
