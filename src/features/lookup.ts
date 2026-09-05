import { putFeatures } from '../db/repo';
import type { FeatureRow, FeatureValue } from '../db/schema';
import type { Model } from '../model/aggregate';
import { storageMessage } from '../util/errors';
import {
  MAX_IDS,
  fetchAudioFeatures,
  normalizeIsrc,
  type FeatureBatch,
  type FetchedFeature,
} from './reccobeats';

/** A "not found" answer is taken as final for ninety days. */
export const LOOKUP_NOT_FOUND_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** One request per second, counted across both passes. */
export const LOOKUP_INTERVAL_MS = 1000;

/**
 * The two progress labels. Pass 2 runs only on the pass-1 misses that carry
 * an ISRC, so its size is unknown until pass 1 has finished; naming the pass
 * is what lets the count restart instead of the denominator growing.
 */
export const PASS_BY_ID = 'by track id';
export const PASS_BY_ISRC = 'retry by ISRC';

/**
 * `running` reports the pass and the tracks that pass has finished, so its
 * denominator is fixed for the whole pass and the bar never walks backwards.
 * `done.total` counts the tracks looked up in the run and always equals
 * `found + notFound`.
 */
export type LookupState =
  | { status: 'idle' }
  | { status: 'running'; pass: string; done: number; total: number }
  | { status: 'done'; found: number; notFound: number; total: number }
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

function toValue(fetched: FetchedFeature): FeatureValue {
  return {
    bpm: fetched.bpm,
    key: fetched.key,
    major: fetched.major,
    energy: fetched.energy,
    fetchedAt: fetched.fetchedAt,
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
 * notFound marker for whatever is still missing. Rows are written per batch,
 * so an error leaves everything fetched so far in place and the next run
 * resumes. Never throws: a failure ends in the error state.
 */
export async function runLookup(
  deps: LookupDeps,
  candidates: Candidate[],
  existing: FeatureRow[]
): Promise<void> {
  const rows = new Map(existing.map((row) => [row.trackId, row]));
  const startedAt = deps.now();
  const todo = candidates.filter((c) => !isFresh(rows.get(c.id), startedAt));
  let requests = 0;
  let pass = PASS_BY_ID;
  let done = 0;
  let total = todo.length;
  let found = 0;
  let notFound = 0;

  function running(): void {
    deps.onState({ status: 'running', pass, done, total });
  }

  async function ask(batchIds: string[]): Promise<FeatureBatch> {
    if (requests > 0) await deps.sleep(LOOKUP_INTERVAL_MS);
    requests += 1;
    return fetchAudioFeatures(batchIds, deps);
  }

  /**
   * `tracks` is the whole batch, not `writes.length`: a pass-1 candidate that
   * missed on its id and goes to the ISRC pass writes no row here, and the
   * count is of tracks looked at, so the pass still ends on its total.
   */
  async function write(writes: FeatureRow[], tracks: number): Promise<void> {
    if (writes.length > 0) await putFeatures(writes);
    done += tracks;
    running();
  }

  try {
    running();
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
    }

    deps.onState({
      status: 'done',
      found,
      notFound,
      total: found + notFound,
    });
  } catch (err) {
    deps.onState({ status: 'error', message: storageMessage(err) });
  }
}
