import type { TracklistRow } from '../../db/schema';
import { nameKey } from '../../model/normalize';

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
 * flip too, or a replace could silently discard a time the owner just set.
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
  // A new artist or title names another track: Check on Spotify's answer
  // (T117) no longer applies; the label or the time change nothing.
  const renamed = edit.artist !== row.artist || edit.title !== row.title;
  const kept: TracklistRow = { ...row };
  if (renamed) {
    delete kept.spotify;
    delete kept.spotifyBy;
    delete kept.checkedAt;
    // A year belongs to a track (S13b N1). A Spotify year goes with the
    // answer above; a Shazam or ISRC year belongs to the identified
    // recording, so it stays only when the row is renamed back to it.
    // Compared as the library match compares names (case, accents and
    // spacing aside): a recased name is still the identified recording.
    const backToDetected =
      row.detected !== null &&
      nameKey(edit.artist, edit.title) ===
        nameKey(row.detected.artist, row.detected.title);
    if (row.yearFrom === 'spotify' || !backToDetected) {
      delete kept.year;
      delete kept.yearFrom;
    }
  }
  return {
    ...kept,
    artist: edit.artist,
    title: edit.title,
    label: label.length > 0 ? label : null,
    startSec: edit.startSec !== undefined ? edit.startSec : row.startSec,
    source: differsFromDetected ? 'manual' : row.source,
  };
}
