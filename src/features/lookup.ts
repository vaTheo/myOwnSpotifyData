import { putFeatures } from '../db/repo';
import type { FeatureRow, FeatureValue } from '../db/schema';
import type { Model } from '../model/aggregate';
import { storageMessage } from '../util/errors';
import {
  MAX_IDS,
  fetchAlbumYear,
  fetchAudioFeatures,
  fetchTrackRids,
  normalizeIsrc,
  type FeatureBatch,
  type FetchedFeature,
} from './reccobeats';
import type { SharedFactsPort, SharedRunNote, SharedTrackFact } from './shared';

/** A "not found" answer is taken as final for ninety days. */
export const LOOKUP_NOT_FOUND_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** One request per second, counted across the three passes. */
export const LOOKUP_INTERVAL_MS = 1000;

/**
 * The two progress labels. Pass 2 runs only on the pass-1 misses that carry
 * an ISRC, so its size is unknown until pass 1 has finished; naming the pass
 * is what lets the count restart instead of the denominator growing.
 */
export const PASS_BY_ID = 'by track id';
export const PASS_BY_ISRC = 'retry by ISRC';
/** Round 005: one album request per found track without a fresh year. */
export const PASS_YEARS = 'release years';
/** Round 006 fix: the id lookups that precede the year requests, counted so
 *  the line moves while they run (forty tracks per request). */
export const PASS_RIDS = 'ReccoBeats ids';

/** Round 014: the shared store is asked before pass 1; 200 ids a call. */
export const PASS_SHARED = 'shared store';
const SHARED_BATCH = 200;

/** Year rows are written every this many tracks, so an error keeps them. */
export const YEAR_WRITE_BATCH = 10;

/**
 * `running` reports the pass and the tracks that pass has finished, so its
 * denominator is fixed for the whole pass and the bar never walks backwards.
 * `done.total` counts the tracks looked up for BPM in the run and always
 * equals `found + notFound`; `done.years` counts the tracks the release-year
 * pass dated in the run (round 005).
 */
export type LookupState =
  | { status: 'idle' }
  | { status: 'running'; pass: string; done: number; total: number }
  | {
      status: 'done';
      found: number;
      notFound: number;
      total: number;
      years: number;
      /** Only when the run had a shared store port. */
      shared?: SharedRunNote;
    }
  | { status: 'error'; message: string };

export interface Candidate {
  id: string;
  isrc: string | null;
}

export interface LookupDeps {
  fetchFn: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  onState: (state: LookupState) => void;
  /** Round 014: absent means no call and no `shared` field in the result. */
  shared?: SharedFactsPort;
}

/**
 * Every synced track with a Spotify id, then every played track from the
 * imported history, deduped by id. History rows carry no ISRC, so those
 * candidates never reach the ISRC pass.
 */
export function candidateIds(model: Model): Candidate[] {
  const out = new Map<string, Candidate>();
  for (const track of model.tracksByKey.values()) {
    if (track.id === null || track.isLocal) continue;
    out.set(track.id, { id: track.id, isrc: normalizeIsrc(track.isrc) });
  }
  for (const row of model.plays) {
    if (row.plays <= 0 || out.has(row.trackId)) continue;
    out.set(row.trackId, { id: row.trackId, isrc: null });
  }
  return [...out.values()];
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** True while the row already answers for ReccoBeats. */
function isFresh(row: FeatureRow | undefined, now: number): boolean {
  const value = row?.reccobeats;
  if (!value) return false;
  if ('notFound' in value) {
    return now - value.checkedAt < LOOKUP_NOT_FOUND_TTL_MS;
  }
  return true;
}

/** True while the row's release year answers (round 005): a year, or a
 *  "none" checked within the not-found lifetime. */
function isYearFresh(row: FeatureRow, now: number): boolean {
  const value = row.releaseYear;
  if (!value) return false;
  if (value.year !== null) return true;
  return now - value.checkedAt < LOOKUP_NOT_FOUND_TTL_MS;
}

/** The row's ReccoBeats value, or null for a notFound marker or none. */
function reccobeatsValue(row: FeatureRow | undefined): FeatureValue | null {
  const value = row?.reccobeats;
  return value && !('notFound' in value) ? value : null;
}

function toValue(fetched: FetchedFeature): FeatureValue {
  return {
    bpm: fetched.bpm,
    key: fetched.key,
    major: fetched.major,
    energy: fetched.energy,
    fetchedAt: fetched.fetchedAt,
    ...(fetched.rid === undefined ? {} : { rid: fetched.rid }),
  };
}

/** Keeps whatever else the row holds, the Rekordbox value included. */
function withReccobeats(
  existing: FeatureRow | undefined,
  candidate: Candidate,
  reccobeats: FeatureRow['reccobeats'],
  isrc: string | null,
  updatedAt: number
): FeatureRow {
  const base = existing ?? { trackId: candidate.id, isrc: candidate.isrc };
  return {
    ...base,
    trackId: candidate.id,
    isrc: candidate.isrc ?? isrc ?? existing?.isrc ?? null,
    reccobeats,
    updatedAt,
  };
}

/**
 * Pass 1 by Spotify id, pass 2 by ISRC for the misses that have one, then a
 * notFound marker for whatever is still missing. Pass 3 (round 005) dates
 * every candidate with a ReccoBeats value and no fresh release year: its
 * ReccoBeats id (stored from pass 1, else asked forty at a time), then one
 * album request, keeping the earliest year. Rows are written per batch, so
 * an error leaves everything fetched so far in place and the next run
 * resumes. One request per second across all three passes. Never throws: a
 * failure ends in the error state.
 */
export async function runLookup(
  deps: LookupDeps,
  candidates: Candidate[],
  existing: FeatureRow[],
  /**
   * Tracks Spotify already dates (an album year from a sync or a Top list):
   * the year pass leaves them out, one album request each saved. Their year
   * still shows, from the album (`datedYear`'s second source).
   */
  albumDated: ReadonlySet<string> = new Set()
): Promise<void> {
  const rows = new Map(existing.map((row) => [row.trackId, row]));
  const startedAt = deps.now();
  let todo = candidates.filter((c) => !isFresh(rows.get(c.id), startedAt));
  let requests = 0;
  let pass = PASS_BY_ID;
  let done = 0;
  let total = todo.length;
  let found = 0;
  let notFound = 0;
  let years = 0;
  /** Pass-3 rows not yet written; flushed on an error too. */
  let pendingYears: FeatureRow[] = [];
  const port = deps.shared;
  /** The first failed read or share switches the port off for this run. */
  let sharedOff = false;
  let sharedError: string | null = null;
  let fromStore = 0;
  let sent = 0;
  /**
   * Facts to give the store. Built ONLY from the `FetchedFeature` ReccoBeats
   * returned, never from a row: a rekordbox value has no path to the port
   * (FR-005). A not-found track is never queued.
   */
  let shareQueue: SharedTrackFact[] = [];

  function sharedFailed(message: string): void {
    sharedOff = true;
    sharedError = message;
    shareQueue = [];
  }

  function queueShare(id: string, fetched: FetchedFeature): void {
    if (!port || sharedOff) return;
    if (fetched.bpm === null && fetched.key === null) return;
    shareQueue.push({
      trackId: id,
      bpm: fetched.bpm,
      key: fetched.key,
      major: fetched.key === null ? null : fetched.major,
    });
  }

  async function flushShare(all: boolean): Promise<void> {
    if (!port) return;
    while (
      !sharedOff &&
      (all ? shareQueue.length > 0 : shareQueue.length >= SHARED_BATCH)
    ) {
      const part = shareQueue.slice(0, SHARED_BATCH);
      shareQueue = shareQueue.slice(SHARED_BATCH);
      try {
        const res = await port.shareTracks(part);
        if (res.ok) sent += res.value;
        else sharedFailed(res.message);
      } catch (err) {
        sharedFailed(err instanceof Error ? err.message : String(err));
      }
    }
  }

  function running(): void {
    deps.onState({ status: 'running', pass, done, total });
  }

  /** Every ReccoBeats request goes through here: one per second. */
  async function paced<T>(call: () => Promise<T>): Promise<T> {
    if (requests > 0) await deps.sleep(LOOKUP_INTERVAL_MS);
    requests += 1;
    return call();
  }

  function ask(batchIds: string[]): Promise<FeatureBatch> {
    return paced(() => fetchAudioFeatures(batchIds, deps));
  }

  async function flushYears(): Promise<void> {
    if (pendingYears.length === 0) return;
    const batch = pendingYears;
    pendingYears = [];
    await putFeatures(batch);
  }

  /** Keeps the BPM, the Rekordbox value and everything else on the row. */
  function withYear(
    row: FeatureRow,
    value: FeatureValue,
    rid: string | null,
    year: number | null,
    at: number
  ): FeatureRow {
    const next: FeatureRow = {
      ...row,
      reccobeats: rid === null ? value : { ...value, rid },
      releaseYear: { year, checkedAt: at },
      updatedAt: at,
    };
    rows.set(row.trackId, next);
    return next;
  }

  /**
   * `tracks` is the whole batch, not `writes.length`: a pass-1 candidate that
   * missed on its id and goes to the ISRC pass writes no row here, and the
   * count is of tracks looked at, so the pass still ends on its total.
   */
  async function write(writes: FeatureRow[], tracks: number): Promise<void> {
    if (writes.length > 0) await putFeatures(writes);
    for (const row of writes) rows.set(row.trackId, row);
    done += tracks;
    running();
  }

  try {
    running();
    if (port && todo.length > 0) {
      pass = PASS_SHARED;
      running();
      const hits: Candidate[] = [];
      const hitIds = new Set<string>();
      const facts = new Map<string, SharedTrackFact>();
      for (const batch of chunk(todo, SHARED_BATCH)) {
        if (sharedOff) break;
        let res;
        try {
          res = await port.readTracks(batch.map((c) => c.id));
        } catch (err) {
          res = {
            ok: false as const,
            message: err instanceof Error ? err.message : String(err),
          };
        }
        if (!res.ok) {
          sharedFailed(res.message);
          break;
        }
        for (const f of res.value) facts.set(f.trackId, f);
        done += batch.length;
        running();
      }
      const at = deps.now();
      const writes: FeatureRow[] = [];
      for (const candidate of todo) {
        const f = facts.get(candidate.id);
        if (!f) continue;
        const value: FeatureValue = {
          bpm: f.bpm,
          key: f.key,
          major: f.major,
          energy: null,
          fetchedAt: at,
        };
        writes.push(
          withReccobeats(rows.get(candidate.id), candidate, value, null, at)
        );
        hits.push(candidate);
        hitIds.add(candidate.id);
      }
      if (writes.length > 0) {
        await putFeatures(writes);
        for (const row of writes) rows.set(row.trackId, row);
      }
      fromStore = hits.length;
      found += hits.length;
      todo = todo.filter((c) => !hitIds.has(c.id));
      pass = PASS_BY_ID;
      done = 0;
      total = todo.length;
      running();
    }
    const missed: (Candidate & { isrc: string })[] = [];
    for (const batch of chunk(todo, MAX_IDS)) {
      const result = await ask(batch.map((c) => c.id));
      const at = deps.now();
      const writes: FeatureRow[] = [];
      for (const candidate of batch) {
        const feature = result.byId.get(candidate.id);
        if (feature) {
          const value = toValue(feature);
          writes.push(
            withReccobeats(
              rows.get(candidate.id),
              candidate,
              value,
              feature.isrc,
              at
            )
          );
          queueShare(candidate.id, feature);
          found += 1;
        } else if (candidate.isrc !== null) {
          missed.push({ ...candidate, isrc: candidate.isrc });
        } else {
          const marker = { notFound: true as const, checkedAt: at };
          writes.push(
            withReccobeats(rows.get(candidate.id), candidate, marker, null, at)
          );
          notFound += 1;
        }
      }
      await write(writes, batch.length);
      await flushShare(false);
    }

    const isrcBatches = chunk(missed, MAX_IDS);
    if (isrcBatches.length > 0) {
      pass = PASS_BY_ISRC;
      done = 0;
      total = missed.length;
      running();
    }
    for (const batch of isrcBatches) {
      const result = await ask(batch.map((c) => c.isrc));
      const at = deps.now();
      const writes: FeatureRow[] = [];
      for (const candidate of batch) {
        const feature = result.byIsrc.get(candidate.isrc);
        if (feature) {
          const value = toValue(feature);
          writes.push(
            withReccobeats(
              rows.get(candidate.id),
              candidate,
              value,
              feature.isrc,
              at
            )
          );
          queueShare(candidate.id, feature);
          found += 1;
        } else {
          const marker = { notFound: true as const, checkedAt: at };
          writes.push(
            withReccobeats(rows.get(candidate.id), candidate, marker, null, at)
          );
          notFound += 1;
        }
      }
      await write(writes, batch.length);
      await flushShare(false);
    }

    await flushShare(true);

    const dated = candidates
      .map((c) => rows.get(c.id))
      .filter(
        (row): row is FeatureRow =>
          row !== undefined &&
          reccobeatsValue(row) !== null &&
          !albumDated.has(row.trackId) &&
          !isYearFresh(row, startedAt)
      );
    const rids = new Map<string, string>();
    const needRid: string[] = [];
    for (const row of dated) {
      const rid = reccobeatsValue(row)?.rid;
      if (rid) rids.set(row.trackId, rid);
      else needRid.push(row.trackId);
    }
    if (needRid.length > 0) {
      pass = PASS_RIDS;
      done = 0;
      total = needRid.length;
      running();
    }
    for (const batch of chunk(needRid, MAX_IDS)) {
      const answer = await paced(() => fetchTrackRids(batch, deps));
      for (const [id, rid] of answer) rids.set(id, rid);
      done += batch.length;
      running();
    }
    if (dated.length > 0) {
      pass = PASS_YEARS;
      done = 0;
      total = dated.length;
      running();
    }
    for (const row of dated) {
      const value = reccobeatsValue(row) as FeatureValue;
      const rid = rids.get(row.trackId) ?? null;
      // ReccoBeats has a value but no id for it: no album to ask.
      const year =
        rid === null ? null : await paced(() => fetchAlbumYear(rid, deps));
      pendingYears.push(withYear(row, value, rid, year, deps.now()));
      if (year !== null) years += 1;
      done += 1;
      if (pendingYears.length >= YEAR_WRITE_BATCH) await flushYears();
      running();
    }
    await flushYears();

    deps.onState({
      status: 'done',
      found,
      notFound,
      total: found + notFound,
      years,
      ...(port ? { shared: { fromStore, sent, error: sharedError } } : {}),
    });
  } catch (err) {
    // The years found before the failure are kept, as the BPM batches are.
    try {
      await flushYears();
    } catch {
      // The first error is the one to show.
    }
    try {
      await flushShare(true);
    } catch {
      // Sharing never changes how the run ends.
    }
    deps.onState({ status: 'error', message: storageMessage(err) });
  }
}
