import type { TracklistRow } from '../../db/schema';
import { fetchOembed, type OembedResult } from './oembed';
import { fetchTrackId, type TrackIdResult } from './trackid';
import { permalinkFromOembed, type MixInput } from './url';

export interface MixDeps {
  fetchFn: typeof fetch;
  /** Spaces TrackId's two calls politely (spec §4); passed on to fetchTrackId. */
  sleep: (ms: number) => Promise<void>;
}

export interface MixLookup {
  oembed: OembedResult;
  trackid: TrackIdResult;
  /**
   * The permalink TrackId was queried on: the input url for a permalink, or the
   * candidate reconstructed from oEmbed for a short link (whether or not the
   * guard confirmed it). null when a short link's oEmbed failed or yielded no
   * candidate, so no TrackId call was made.
   */
  resolvedUrl: string | null;
}

/**
 * Runs the two layers and folds them into one result. Never throws: both fetch
 * functions return a typed error arm rather than rejecting (spec §3), so a
 * layer's failure cannot hide the other's rows (spec §4) — the discipline
 * `startLookup` leans on with `runLookup`.
 *
 * A **permalink** runs oEmbed and TrackId in parallel on the input url, exactly
 * as before. A **short link** cannot be followed cross-origin, so the app runs
 * oEmbed first (SoundCloud resolves the token server-side), reconstructs the
 * permalink from oEmbed's `author_url` + `title`, and only then queries TrackId
 * on that candidate. The TrackId guard (rowCount 1 AND an exact url match)
 * confirms the candidate: a wrong reconstruction is a `notFound`, never a wrong
 * mix. When oEmbed fails or yields no candidate, TrackId is not called and its
 * arm is `notFound`.
 */
export async function lookupMix(
  deps: MixDeps,
  input: MixInput
): Promise<MixLookup> {
  if (input.kind === 'permalink') {
    const [oembed, trackid] = await Promise.all([
      fetchOembed(deps.fetchFn, input.url),
      fetchTrackId(deps.fetchFn, input.url, deps.sleep),
    ]);
    return { oembed, trackid, resolvedUrl: input.url };
  }
  // Short link: resolve via oEmbed first, then reconstruct + guard on TrackId.
  const oembed = await fetchOembed(deps.fetchFn, input.url);
  let trackid: TrackIdResult = { status: 'notFound' };
  let resolvedUrl: string | null = null;
  if (oembed.status === 'ok') {
    // oembed.author (author_name) lets permalinkFromOembed strip the " by
    // <author>" suffix SoundCloud appends to the title before slugging it.
    const candidate = permalinkFromOembed(
      oembed.authorUrl,
      oembed.title,
      oembed.author
    );
    if (candidate !== null) {
      resolvedUrl = candidate;
      trackid = await fetchTrackId(deps.fetchFn, candidate, deps.sleep);
    }
  }
  return { oembed, trackid, resolvedUrl };
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
 * reversible and provenance survives; the `source` flips to `'manual'` when
 * the artist or title now differs from `detected`, or the time is genuinely
 * changed from what the row had (there is no "detected" time to diff
 * against, so the row's own prior `startSec` is the baseline) — a label-only
 * edit, an edit that restores the detected values with the same time, or a
 * patch that omits `startSec` entirely, leaves the source alone. This
 * matters beyond provenance display: `hasManualRows` (and so the I2/§8
 * replace-guards) key off `source === 'manual'`, so a retimed-only row must
 * flip too, or a re-lookup could silently discard a time the owner just set.
 * A row with no `detected` (one the owner added) is already `'manual'` and
 * stays so. The label is trimmed and empties to `null`. `startSec` is
 * optional (M5): omitted, the row's time is left as it was; given, it
 * replaces it (`null` clears it — an empty time field means "no time").
 */
export function editTracklistRow(
  row: TracklistRow,
  edit: {
    artist: string;
    title: string;
    label: string;
    startSec?: number | null;
  }
): TracklistRow {
  const label = edit.label.trim();
  const differsFromDetected =
    row.detected !== null &&
    (edit.artist !== row.detected.artist ||
      edit.title !== row.detected.title ||
      (edit.startSec !== undefined && edit.startSec !== row.startSec));
  return {
    ...row,
    artist: edit.artist,
    title: edit.title,
    label: label.length > 0 ? label : null,
    startSec: edit.startSec !== undefined ? edit.startSec : row.startSec,
    source: differsFromDetected ? 'manual' : row.source,
  };
}
