import type { TracklistRow } from '../../db/schema';
import { fetchOembed, type OembedResult } from './oembed';
import { fetchTrackId, type TrackIdResult } from './trackid';

export interface MixDeps {
  fetchFn: typeof fetch;
  /** Spaces TrackId's two calls politely (spec §4); passed on to fetchTrackId. */
  sleep: (ms: number) => Promise<void>;
}

export interface MixLookup {
  oembed: OembedResult;
  trackid: TrackIdResult;
}

/**
 * Runs oEmbed and TrackId in parallel and folds the two into one result.
 * Never throws: both fetch functions return a typed error arm rather than
 * rejecting (spec §3), so `Promise.all` cannot reject and one layer's failure
 * cannot hide the other's rows (spec §4). This is the same discipline
 * `startLookup` leans on with `runLookup`.
 */
export async function lookupMix(
  deps: MixDeps,
  normUrl: string
): Promise<MixLookup> {
  const [oembed, trackid] = await Promise.all([
    fetchOembed(deps.fetchFn, normUrl),
    fetchTrackId(deps.fetchFn, normUrl, deps.sleep),
  ]);
  return { oembed, trackid };
}

/**
 * True when the working list holds anything the owner curated — a row typed
 * from scratch or an edit that moved a value off `detected` (both carry
 * `source: 'manual'`, §5.3). It is the guard the replace actions check before
 * a `confirm()`, kept pure here so it can be tested; the `confirm()` itself
 * stays in `state.ts`, as `startSync`'s does.
 */
export function hasManualRows(rows: TracklistRow[]): boolean {
  return rows.some((row) => row.source === 'manual');
}

/**
 * The per-row edit rule (spec §4). `detected` is preserved so the edit is
 * reversible and provenance survives; the `source` flips to `'manual'` only
 * when the artist or title now differs from `detected` — a label-only edit,
 * or an edit that restores the detected values, leaves the source alone. A
 * row with no `detected` (one the owner added) is already `'manual'` and
 * stays so. The label is trimmed and empties to `null`.
 */
export function editTracklistRow(
  row: TracklistRow,
  edit: { artist: string; title: string; label: string }
): TracklistRow {
  const label = edit.label.trim();
  const differsFromDetected =
    row.detected !== null &&
    (edit.artist !== row.detected.artist || edit.title !== row.detected.title);
  return {
    ...row,
    artist: edit.artist,
    title: edit.title,
    label: label.length > 0 ? label : null,
    source: differsFromDetected ? 'manual' : row.source,
  };
}
