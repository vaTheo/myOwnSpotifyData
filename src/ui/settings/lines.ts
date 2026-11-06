/**
 * The status lines of the Settings sections, word for word what the cards
 * printed before spec 003 (FR-049: where things sit changes, never what they
 * say). Pure, so they are tested without a DOM.
 */
import type { ReachRunCounts, ReachStep } from '../../features/reachRun';
import type { RekordboxSummary } from '../../features/rekordboxImport';
import type { ImportSummary } from '../../history/importer';
// Type-only: this file never evaluates state.ts under Vitest.
import type { Coverage, ReachCoverage } from '../../model/state';
import { formatDate, plural } from '../format';

/** The Free plan's database allowance, mirrored from `SERVER_FREE_BYTES`. */
export function usedShare(bytes: number, freeBytes: number): string {
  const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
  return `${mb(bytes)} MB of ${mb(freeBytes)} MB used on the server`;
}

export function historyLine(
  summary: ImportSummary,
  zoneAtImport?: string
): string {
  const parts = [
    `Imported ${formatDate(summary.importedAt)}:`,
    `${plural(summary.plays, 'play')} across`,
    `${plural(summary.tracks, 'track')}.`,
  ];
  if (summary.range) {
    parts.push(`${formatDate(summary.range.first)} –`);
    parts.push(`${formatDate(summary.range.last)}.`);
  }
  if (zoneAtImport) parts.push(`Months bucketed in ${zoneAtImport}.`);
  return parts.join(' ');
}

/** Spec §5: "BPM and key for 3,120 of 4,980 tracks · ReccoBeats 2,900 · …". */
export function coverageLine(c: Coverage): string {
  const total = plural(c.total, 'track');
  return [
    `BPM and key for ${c.covered.toLocaleString()} of ${total}`,
    `ReccoBeats ${c.reccobeats.toLocaleString()}`,
    `Rekordbox ${c.rekordbox.toLocaleString()}`,
  ].join(' · ');
}

/** "parsed 1,204 · with BPM 1,190 · with key 1,050 · matched 820 · …" */
export function rekordboxLine(s: RekordboxSummary): string {
  return [
    `parsed ${s.parsed.toLocaleString()}`,
    `with BPM ${s.withBpm.toLocaleString()}`,
    `with key ${s.withKey.toLocaleString()}`,
    `matched ${s.matched.toLocaleString()}`,
    `unmatched ${s.unmatched.toLocaleString()}`,
  ].join(' · ');
}

export const SOURCE_LABEL: Record<ReachStep, string> = {
  musicbrainz: 'MusicBrainz',
  listenbrainz: 'ListenBrainz',
  deezer: 'Deezer',
  wikidata: 'Wikidata',
  wikipedia: 'Wikipedia',
};

/**
 * Spec §5.5: "Reach data for 806 of 1,204 artists · MusicBrainz 1,151 · …".
 * The source counts overlap on purpose, exactly as the Audio data card's do,
 * so they can add up to more than `covered`.
 */
export function reachCoverageLine(c: ReachCoverage): string {
  const artists = plural(c.artists, 'artist');
  return [
    `Reach data for ${c.covered.toLocaleString()} of ${artists}`,
    `MusicBrainz ${c.resolved.toLocaleString()}`,
    `ListenBrainz ${c.listenbrainz.toLocaleString()}`,
    `Deezer ${c.deezer.toLocaleString()}`,
    `Wikipedia ${c.wikipedia.toLocaleString()}`,
    `well known ${c.wellKnown.toLocaleString()}`,
  ].join(' · ');
}

/**
 * What this run did, never what the store holds: `lookedUp` and `written`
 * are run-scoped, and `unresolved` is the whole-store figure the owner asks
 * for once a run has stopped (spec §5.5).
 */
export function reachRunLine(run: ReachRunCounts): string {
  return [
    `Looked up ${plural(run.lookedUp, 'artist')}`,
    plural(run.written, 'new number'),
    `${run.unresolved.toLocaleString()} unresolved`,
  ].join(' · ');
}

export function pausedLine(step: ReachStep): string {
  return (
    `${SOURCE_LABEL[step]} stopped answering after three tries; ` +
    'the rest of this run skipped it.'
  );
}
