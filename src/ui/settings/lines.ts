/**
 * The status lines of the Settings sections, word for word what the cards
 * printed before spec 003 (FR-049: where things sit changes, never what they
 * say). Pure, so they are tested without a DOM.
 */
import type { ReachRunCounts, ReachStep } from '../../features/reachRun';
import type { RekordboxSummary } from '../../features/rekordboxImport';
import type { ServerPending } from '../../db/schema';
// Type-only: this file never evaluates state.ts under Vitest.
import type { Coverage, ReachCoverage } from '../../model/state';
import { plural } from '../format';

/** The Free plan's database allowance, mirrored from `SERVER_FREE_BYTES`. */
export function usedShare(bytes: number, freeBytes: number): string {
  const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
  return `${mb(bytes)} MB of ${mb(freeBytes)} MB used on the server`;
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

/** Round 005: "Release years: 3,120 of 4,980 tracks". */
export function yearsLine(dated: number, total: number): string {
  return `Release years: ${dated.toLocaleString()} of ${plural(total, 'track')}`;
}

/** The look-up's done line: "found 12 · not found 3 · years 40". */
export function lookupDoneLine(d: {
  found: number;
  notFound: number;
  years: number;
}): string {
  return [
    `found ${d.found.toLocaleString()}`,
    `not found ${d.notFound.toLocaleString()}`,
    `years ${d.years.toLocaleString()}`,
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

/** The server datasets in the words of the Settings sections. */
const PENDING_NAMES: Record<keyof ServerPending, string> = {
  library: 'Library',
  history: 'Listening history',
  features: 'Audio data',
  reach: 'Artist reach',
  mixes: 'Mixes',
};

/**
 * The changes waiting to send to the server (FR-050): `0` when nothing
 * waits (a real zero), else the count and the datasets in page order:
 * `2 · Listening history, Mixes`.
 */
export function pendingValue(pending: ServerPending): string {
  const names = (Object.keys(PENDING_NAMES) as (keyof ServerPending)[])
    .filter((name) => pending[name] === true)
    .map((name) => PENDING_NAMES[name]);
  return names.length === 0 ? '0' : `${names.length} · ${names.join(', ')}`;
}

/** The Settings server section's line for the same figure. */
export function pendingLine(pending: ServerPending): string {
  return `Changes waiting to send: ${pendingValue(pending)}`;
}

/** Round 009: "3 people use this device", or null for one person or none. */
export function deviceUsersLine(n: number): string | null {
  return n > 1 ? `${n.toLocaleString()} people use this device` : null;
}

/**
 * The Danger zone's words: today's without a server (FR-008); with one, the
 * device may hold several people's data and Disconnect touches only yours.
 */
export function dangerDescription(serverSetUp: boolean): string {
  return serverSetUp
    ? "Removes your Spotify login and deletes your cached playlists and play counts from this browser. Your server data and other people's data on this device are kept."
    : 'Removes the Spotify login and deletes every cached playlist and play count from this browser. Server data is kept.';
}
