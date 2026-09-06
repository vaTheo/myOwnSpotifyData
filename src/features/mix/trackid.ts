import type { TracklistRow } from '../../db/schema';
import { parseClock } from './parse';

/** List endpoint; `?url=` is an exact string filter (spec §3.3). */
export const TRACKID_LIST_URL = 'https://trackid.net/api/public/audiostreams';

/** Two spans of the same track merge only if the later start is within this
 *  many seconds of the earlier end — a reprocess continuation, not a replay. */
export const MIX_MERGE_TOLERANCE_SEC = 5;

/** Only a silent stretch at least this long earns an `ID · unidentified` row
 *  (research §5.5's "every span >=60 s with no accepted run"). */
export const MIX_GAP_MIN_SEC = 60;

/** Polite spacing between the list and detail calls, when a sleep is supplied. */
export const TRACKID_INTERVAL_MS = 250;

export type TrackIdResult =
  | {
      status: 'ok';
      slug: string;
      title: string;
      channel: string;
      durationSec: number | null;
      /** 0..1 coverage, rendered as a percentage; never a track count. */
      timeHitRate: number | null;
      /** Identified spans plus `ID · unidentified` gap rows, in play order.
       *  May be [] when the mix is known but nothing was identified. */
      rows: TracklistRow[];
    }
  | { status: 'notFound' }
  | { status: 'error'; message: string };

/** `GET .../audiostreams?url=<encoded normUrl>` — call 1, the list. */
export function trackidListUrl(normUrl: string): string {
  return `${TRACKID_LIST_URL}?url=${encodeURIComponent(normUrl)}`;
}

/** `GET .../audiostreams/<slug>` — call 2, the spans. The slug is the value
 *  from the validated list record, never derived from the permalink (§3.3). */
export function trackidDetailUrl(slug: string): string {
  return `${TRACKID_LIST_URL}/${encodeURIComponent(slug)}`;
}

function field(raw: unknown, name: string): unknown {
  if (typeof raw !== 'object' || raw === null) return undefined;
  return (raw as Record<string, unknown>)[name];
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

interface Span {
  /** Merge-grouping key: the track id as a string when one was given (a
   *  numeric id included), or a per-span-unique key when it was missing —
   *  never a shared `''`, or every missing-id span would merge as "the same
   *  track" (I1). */
  mergeKey: string;
  startSec: number;
  endSec: number;
  artist: string;
  title: string;
  label: string | null;
  referenceCount: number | null;
}

/** The merge-grouping key for a span's raw `musicTrackId`: a real id (number
 *  or non-empty string) keys by its string form so two spans of the same
 *  track merge; a missing id (anything else) gets a key unique to this span
 *  so distinct untagged spans never merge with one another. `index` is the
 *  span's position in flatten order, unique per call. */
function mergeKeyFor(rawId: unknown, index: number): string {
  if (typeof rawId === 'number' && Number.isFinite(rawId)) {
    return `id:${rawId}`;
  }
  if (typeof rawId === 'string' && rawId !== '') return `id:${rawId}`;
  return `missing:${index}`;
}

function identifiedRow(span: Span): TracklistRow {
  return {
    startSec: span.startSec,
    endSec: span.endSec,
    artist: span.artist,
    title: span.title,
    label: span.label,
    source: 'trackid',
    gap: false,
    detected: { artist: span.artist, title: span.title },
    referenceCount: span.referenceCount,
  };
}

function gapRow(startSec: number, endSec: number): TracklistRow {
  return {
    startSec,
    endSec,
    artist: '',
    title: '',
    label: null,
    source: 'trackid',
    gap: true,
    detected: null,
    referenceCount: null,
  };
}

/**
 * The detail record's spans to rows: flatten every `detectionProcess`, merge a
 * reprocess continuation of the same track, sort, then emit `ID · unidentified`
 * gap rows for the head, each between-span stretch, and the tail (only when
 * `durationSec` is known), each at least MIX_GAP_MIN_SEC long. Order is
 * flatten -> merge -> sort -> gaps. A span whose startTime or endTime does not
 * parse as a clock, or whose endTime is before its startTime (malformed), is
 * dropped, not placed at zero or given a negative length. When nothing was
 * identified the result is [] — never one gap row spanning the whole mix —
 * so the screen can tell "known but empty" from "one gap".
 */
export function tidSpansToRows(
  record: unknown,
  durationSec: number | null
): TracklistRow[] {
  // 1. Flatten across all detection processes, keeping only parseable,
  //    well-formed spans.
  const spans: Span[] = [];
  for (const process of arr(field(record, 'detectionProcesses'))) {
    for (const t of arr(field(process, 'detectionProcessMusicTracks'))) {
      const startSec = parseClock(str(field(t, 'startTime')));
      const endSec = parseClock(str(field(t, 'endTime')));
      if (startSec === null || endSec === null) continue;
      if (endSec < startSec) continue; // M4: malformed span, drop it.
      spans.push({
        mergeKey: mergeKeyFor(field(t, 'musicTrackId'), spans.length),
        startSec,
        endSec,
        artist: str(field(t, 'artist')),
        title: str(field(t, 'title')),
        label:
          typeof field(t, 'label') === 'string'
            ? String(field(t, 'label'))
            : null,
        referenceCount: num(field(t, 'referenceCount')),
      });
    }
  }

  // 2. Merge same-musicTrackId spans that overlap or abut (reprocess
  //    continuation), but not a genuine replay two hours later. A missing id
  //    got its own unique mergeKey above, so it never merges with another
  //    missing-id span.
  const byTrack = new Map<string, Span[]>();
  for (const span of spans) {
    const group = byTrack.get(span.mergeKey);
    if (group) group.push(span);
    else byTrack.set(span.mergeKey, [span]);
  }
  const merged: Span[] = [];
  for (const group of byTrack.values()) {
    group.sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
    let current = group[0];
    for (let i = 1; i < group.length; i += 1) {
      const next = group[i];
      if (next.startSec <= current.endSec + MIX_MERGE_TOLERANCE_SEC) {
        current = { ...current, endSec: Math.max(current.endSec, next.endSec) };
      } else {
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);
  }

  // 3. Sort ascending by start, then end.
  merged.sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);

  // A mix known to TrackId but with no identified track is [] (not one gap).
  if (merged.length === 0) return [];

  // 4 + 5. Interleave identified rows with the gap rows around them. `merged`
  // is sorted by start, not by end, so a longer earlier span can outlast a
  // later shorter one (a crossfade) — track the running max end seen so far
  // (M3) rather than trusting the last-by-start span's endSec, or a
  // following gap can start too early (or a phantom tail gap can appear).
  const rows: TracklistRow[] = [];
  if (merged[0].startSec >= MIX_GAP_MIN_SEC) {
    rows.push(gapRow(0, merged[0].startSec));
  }
  let maxEnd = merged[0].endSec;
  for (let i = 0; i < merged.length; i += 1) {
    maxEnd = Math.max(maxEnd, merged[i].endSec);
    rows.push(identifiedRow(merged[i]));
    const next = merged[i + 1];
    if (next && next.startSec - maxEnd >= MIX_GAP_MIN_SEC) {
      rows.push(gapRow(maxEnd, next.startSec));
    }
  }
  if (durationSec !== null && durationSec - maxEnd >= MIX_GAP_MIN_SEC) {
    rows.push(gapRow(maxEnd, durationSec));
  }
  return rows;
}

/**
 * The two-call TrackId flow (spec §3.3). Call 1 lists by `?url=`; THE GUARD
 * accepts it only when `rowCount === 1` AND the record's `url` equals `normUrl`
 * — anything else (rowCount 0, rowCount > 1, or a url mismatch) is `notFound`,
 * never a fallback to the first record. The slug is read from that validated
 * record. Call 2 fetches the spans by slug and is accepted only when the detail
 * record's `url` and `slug` both match. Guard failures are `notFound` (a
 * factual claim the screen makes about the corpus); any non-2xx or non-JSON is
 * `error` (a "could not be reached" the screen shows instead). `trackCount` is
 * never trusted as the identified count. Default fetch credentials only (§3).
 *
 * `sleep` is optional: when supplied it spaces the list and detail calls
 * politely (§4). fetchTrackId(fetchFn, normUrl) is the §3.3 signature; the
 * trailing sleep is additive so a two-argument call site still compiles.
 */
export async function fetchTrackId(
  fetchFn: typeof fetch,
  normUrl: string,
  sleep?: (ms: number) => Promise<void>
): Promise<TrackIdResult> {
  // Call 1: the list.
  let listBody: unknown;
  try {
    const res = await fetchFn(trackidListUrl(normUrl));
    if (!res.ok) return { status: 'error', message: `HTTP ${res.status}` };
    listBody = await res.json();
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
  const result = field(listBody, 'result');
  const records = arr(field(result, 'audiostreams'));
  const rowCount = num(field(result, 'rowCount'));
  const record = records[0];
  // THE GUARD.
  if (rowCount !== 1 || records.length !== 1) return { status: 'notFound' };
  if (str(field(record, 'url')) !== normUrl) return { status: 'notFound' };
  const slug = str(field(record, 'slug'));
  if (slug === '') return { status: 'notFound' };
  const durationSec = parseClock(str(field(record, 'duration')));
  const title = str(field(record, 'title'));
  const channel = str(field(record, 'channel'));
  const timeHitRate = num(field(record, 'timeHitRate'));

  if (sleep) await sleep(TRACKID_INTERVAL_MS);

  // Call 2: the spans, by slug.
  let detailBody: unknown;
  try {
    const res = await fetchFn(trackidDetailUrl(slug));
    if (!res.ok) return { status: 'error', message: `HTTP ${res.status}` };
    detailBody = await res.json();
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
  const detail = field(detailBody, 'result');
  if (
    str(field(detail, 'url')) !== normUrl ||
    str(field(detail, 'slug')) !== slug
  ) {
    return { status: 'notFound' };
  }
  return {
    status: 'ok',
    slug,
    title,
    channel,
    durationSec,
    timeHitRate,
    rows: tidSpansToRows(detail, durationSec),
  };
}
