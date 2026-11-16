/**
 * The status lines of the Settings sections, word for word what the cards
 * printed before spec 003 (FR-049: where things sit changes, never what they
 * say). Pure, so they are tested without a DOM. Each fragment with its number
 * is one catalogue entry; the ` · ` join stays here (spec 031).
 */
import type { ReachRunCounts, ReachStep } from '../../features/reachRun';
import type { RekordboxSummary } from '../../features/rekordboxImport';
import type { ServerPending } from '../../db/schema';
import { fmt, msg } from '../../i18n';
// Type-only: this file never evaluates state.ts under Vitest.
import type { Coverage, ReachCoverage } from '../../model/state';

const text = () => msg().settings.lines;

/** The Free plan's database allowance, mirrored from `SERVER_FREE_BYTES`. */
export function usedShare(bytes: number, freeBytes: number): string {
  const mb = (n: number) => n / (1024 * 1024);
  return text().usedShare(mb(bytes), mb(freeBytes));
}

/** Whose server session this is: the Settings server card and Connect. */
export function signedInLine(email: string): string {
  return email ? text().signedInAs(email) : text().signedInOwner;
}

/** Spec §5: "BPM and key for 3,120 of 4,980 tracks · ReccoBeats 2,900 · …". */
export function coverageLine(c: Coverage): string {
  return [
    text().coverage(c.covered, c.total),
    `ReccoBeats ${fmt.int(c.reccobeats)}`,
    `Rekordbox ${fmt.int(c.rekordbox)}`,
  ].join(' · ');
}

/** Round 005: "Release years: 3,120 of 4,980 tracks". */
export function yearsLine(dated: number, total: number): string {
  return text().years(dated, total);
}

/** The look-up's done line: "found 12 · not found 3 · years 40". */
export function lookupDoneLine(d: {
  found: number;
  notFound: number;
  years: number;
}): string {
  const t = text();
  return [t.found(d.found), t.notFound(d.notFound), t.yearsFound(d.years)].join(
    ' · '
  );
}

/** Round 014 (FR-011): shown with the server set up and a session. */
export function sharedNoticeBpm(): string {
  return text().sharedNoticeBpm;
}

export function sharedNoticeReach(): string {
  return text().sharedNoticeReach;
}

/**
 * Round 014: what a run took from and gave to the shared store, or null when
 * there is nothing to say (no port, or the store knew nothing and took
 * nothing). An error is a line of its own, never a banner.
 */
export function sharedRunLine(
  shared: { fromStore: number; sent: number; error: string | null } | undefined,
  what: 'tracks' | 'artists' = 'tracks'
): { kind: 'success' | 'error'; text: string } | null {
  if (!shared) return null;
  if (shared.error !== null) {
    return { kind: 'error', text: text().sharedError(shared.error) };
  }
  if (shared.fromStore === 0 && shared.sent === 0) return null;
  return {
    kind: 'success',
    text:
      what === 'tracks'
        ? text().sharedTracks(shared.fromStore, shared.sent)
        : text().sharedArtists(shared.fromStore, shared.sent),
  };
}

/** "parsed 1,204 · with BPM 1,190 · with key 1,050 · matched 820 · …" */
export function rekordboxLine(s: RekordboxSummary): string {
  const t = text();
  return [
    t.parsed(s.parsed),
    t.withBpm(s.withBpm),
    t.withKey(s.withKey),
    t.matched(s.matched),
    t.unmatched(s.unmatched),
  ].join(' · ');
}

/** The sources' own names, the same in every language. */
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
  const t = text();
  return [
    t.reachFor(c.covered, c.artists),
    `MusicBrainz ${fmt.int(c.resolved)}`,
    `ListenBrainz ${fmt.int(c.listenbrainz)}`,
    `Deezer ${fmt.int(c.deezer)}`,
    `Wikipedia ${fmt.int(c.wikipedia)}`,
    t.wellKnown(c.wellKnown),
  ].join(' · ');
}

/**
 * What this run did, never what the store holds: `lookedUp` and `written`
 * are run-scoped, and `unresolved` is the whole-store figure the owner asks
 * for once a run has stopped (spec §5.5).
 */
export function reachRunLine(run: ReachRunCounts): string {
  const t = text();
  return [
    t.lookedUp(run.lookedUp),
    t.newNumbers(run.written),
    t.unresolved(run.unresolved),
  ].join(' · ');
}

export function pausedLine(step: ReachStep): string {
  return text().paused(SOURCE_LABEL[step]);
}

/**
 * The changes waiting to send to the server (FR-050): `0` when nothing
 * waits (a real zero), else the count and the datasets in page order, named
 * as the Settings sections: `2 · Listening history, Mixes`.
 */
export function pendingValue(pending: ServerPending): string {
  const named: Record<keyof ServerPending, string> = text().pending;
  const names = (Object.keys(named) as (keyof ServerPending)[])
    .filter((name) => pending[name] === true)
    .map((name) => named[name]);
  return names.length === 0
    ? fmt.int(0)
    : `${fmt.int(names.length)} · ${names.join(', ')}`;
}

/** A server data set's name as shown (`library`), or the name as received. */
export function datasetName(name: string): string {
  const names: Record<string, string> = msg().settings.datasets;
  return Object.hasOwn(names, name) ? names[name] : name;
}

/** The Settings server section's line for the same figure. */
export function pendingLine(pending: ServerPending): string {
  return text().pendingLine(pendingValue(pending));
}

/** round 011: "3 people use this device", or null for one person or none. */
export function deviceUsersLine(n: number): string | null {
  return n > 1 ? text().deviceUsers(n) : null;
}

/**
 * The Danger zone's words: today's without a server (FR-008); with one, the
 * device may hold several people's data and Disconnect touches only yours.
 */
export function dangerDescription(serverSetUp: boolean): string {
  return serverSetUp ? text().dangerServer : text().dangerLocal;
}
