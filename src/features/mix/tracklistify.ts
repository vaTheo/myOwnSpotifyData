import type { MixRowSource, TracklistRow } from '../../db/schema';
import { parseClock } from './parse';

export type TracklistifyImport =
  | { status: 'ok'; url: string; title: string; rows: TracklistRow[] }
  | { status: 'error'; message: string };

interface TracklistifyTrackJson {
  song_name?: unknown;
  artist?: unknown;
  time_in_mix?: unknown;
  confidence?: unknown;
  metadata?: {
    isrc?: unknown;
    label?: unknown;
    links?: { shazam?: unknown };
  };
}

interface TracklistifyJson {
  mix_info?: {
    title?: unknown;
    audio_filename?: unknown;
  };
  tracks?: unknown;
}

const SOURCE: MixRowSource = 'tracklistify';

/**
 * The link only when it is an https page on shazam.com: it comes from a file
 * and becomes an `href`, so anything else (a `javascript:` URL) is dropped.
 */
function shazamLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname;
  return url.protocol === 'https:' &&
    (host === 'shazam.com' || host === 'www.shazam.com')
    ? url.href
    : null;
}

/** One track entry to a row, or null when it has no usable artist/title. */
function toRow(track: TracklistifyTrackJson): TracklistRow | null {
  if (typeof track !== 'object' || track === null) return null;
  const artist = typeof track.artist === 'string' ? track.artist.trim() : '';
  const title =
    typeof track.song_name === 'string' ? track.song_name.trim() : '';
  if (artist === '' || title === '') return null;
  const startSec =
    typeof track.time_in_mix === 'string'
      ? parseClock(track.time_in_mix)
      : null;
  const confidence =
    typeof track.confidence === 'number' ? track.confidence : null;
  const label =
    typeof track.metadata?.label === 'string' ? track.metadata.label : null;
  const isrc =
    typeof track.metadata?.isrc === 'string' ? track.metadata.isrc : null;
  return {
    startSec,
    endSec: null,
    artist,
    title,
    label,
    source: SOURCE,
    gap: false,
    detected: { artist, title },
    referenceCount: null,
    confidence,
    isrc,
    shazamUrl: shazamLink(track.metadata?.links?.shazam),
  };
}

/**
 * Parses a Tracklistify `tracklist.json`. Never throws: a malformed file, a
 * wrong shape, or zero usable tracks all return `status: 'error'`; one
 * malformed track entry among good ones is dropped, not fatal (spec §5).
 * `url` is the synthetic `tracklistify:<audio_filename>` save key (spec §4);
 * `title` restores Tracklistify's filesystem-safe `⧸` to a plain `/`.
 */
export function parseTracklistifyJson(text: string): TracklistifyImport {
  let json: TracklistifyJson;
  try {
    json = JSON.parse(text) as TracklistifyJson;
  } catch {
    return { status: 'error', message: 'That is not a JSON file.' };
  }
  if (typeof json !== 'object' || json === null) {
    return {
      status: 'error',
      message: "That doesn't look like a Tracklistify tracklist.json.",
    };
  }
  const rawTitle = json.mix_info?.title;
  const audioFilename = json.mix_info?.audio_filename;
  if (
    typeof rawTitle !== 'string' ||
    rawTitle.trim() === '' ||
    typeof audioFilename !== 'string' ||
    audioFilename.trim() === '' ||
    !Array.isArray(json.tracks)
  ) {
    return {
      status: 'error',
      message: "That doesn't look like a Tracklistify tracklist.json.",
    };
  }
  const rows = (json.tracks as TracklistifyTrackJson[])
    .map(toRow)
    .filter((r): r is TracklistRow => r !== null);
  if (rows.length === 0) {
    return { status: 'error', message: 'No tracks found in that file.' };
  }
  return {
    status: 'ok',
    url: `tracklistify:${audioFilename}`,
    title: rawTitle.trim().replace(/⧸/g, '/'),
    rows,
  };
}
