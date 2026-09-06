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

describe('lookupMix', () => {
  it('runs both arms and returns each result verbatim', async () => {
    oembedMock.mockResolvedValue(okOembed);
    trackidMock.mockResolvedValue(okTrackid);
    const result = await lookupMix(deps, NORM);
    expect(oembedMock).toHaveBeenCalledWith(deps.fetchFn, NORM);
    expect(trackidMock).toHaveBeenCalledWith(deps.fetchFn, NORM, deps.sleep);
    expect(result).toEqual({ oembed: okOembed, trackid: okTrackid });
  });

  it('keeps the TrackId rows when oEmbed errors — one failure cannot hide the other', async () => {
    oembedMock.mockResolvedValue({ status: 'error', message: 'network down' });
    trackidMock.mockResolvedValue(okTrackid);
    const result = await lookupMix(deps, NORM);
    expect(result.oembed).toEqual({ status: 'error', message: 'network down' });
    expect(result.trackid).toEqual(okTrackid);
  });

  it('returns two error arms when both layers fail, and does not throw', async () => {
    oembedMock.mockResolvedValue({ status: 'error', message: 'oembed boom' });
    trackidMock.mockResolvedValue({ status: 'error', message: 'trackid boom' });
    await expect(lookupMix(deps, NORM)).resolves.toEqual({
      oembed: { status: 'error', message: 'oembed boom' },
      trackid: { status: 'error', message: 'trackid boom' },
    });
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
