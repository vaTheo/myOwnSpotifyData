import type {
  PortResult,
  SharedFactsPort,
  SharedReachFact,
  SharedTrackFact,
} from '../features/shared';
import type { ServerClient, ServerResult } from './client';
import {
  SHARED_BPM_MAX,
  SHARED_BPM_MIN,
  SHARED_ID_PATTERN,
  SHARED_MAX_IDS,
  sharedReachValueOk,
  sharedTrackFactOk,
  validateSharedReachFact,
  validateSharedTrackFact,
} from './validate';

/**
 * The shared track facts port (round 014, ADR-15), over the server client:
 * two by-id reads through the get_* definer functions, two shares through the
 * add_* definer functions (the tables take no direct insert: ADR-15 "Revised").
 * Nothing here throws, nothing retries, every call ends within the timeout.
 * Whether a failure switches the port off for the rest of a run is the run's
 * call (`lookup.ts`, `reachRun.ts`): the port keeps no state.
 *
 * The numbers are the migration's; they live in `validate.ts` (so the row
 * checks and this file share them without a cycle) and are re-exported here.
 */
export { SHARED_BPM_MAX, SHARED_BPM_MIN, SHARED_MAX_IDS };
export { SHARED_ID_PATTERN };
export const SHARED_TIMEOUT_MS = 10_000;

export const NOT_SIGNED_IN = 'Not signed in to the server';

const DAY_MS = 86_400_000;

export interface SharedFactsDeps {
  client: ServerClient;
  /** The signed-in user's access token (`serverAuth.getAccessToken`). */
  getToken: () => Promise<ServerResult<string>>;
  now: () => number;
}

function chunks<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += SHARED_MAX_IDS) {
    out.push(list.slice(i, i + SHARED_MAX_IDS));
  }
  return out;
}

function day(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function createSharedFactsPort(deps: SharedFactsDeps): SharedFactsPort {
  /** One request bounded by the timeout, as a failed result when it runs out. */
  async function bounded<T>(
    run: (token: string) => Promise<ServerResult<T>>
  ): Promise<PortResult<T>> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const token = await deps.getToken();
      if (!token.ok) return { ok: false, message: NOT_SIGNED_IN };
      const timeout = new Promise<PortResult<T>>((resolve) => {
        timer = setTimeout(
          () => resolve({ ok: false, message: 'The server did not answer' }),
          SHARED_TIMEOUT_MS
        );
      });
      const call = run(token.value).then((res): PortResult<T> =>
        res.ok
          ? { ok: true, value: res.value }
          : { ok: false, message: res.message }
      );
      return await Promise.race([call, timeout]);
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function read<T>(
    fn: string,
    ids: string[],
    keep: (raw: unknown, asked: ReadonlySet<string>) => T | null
  ): Promise<PortResult<T[]>> {
    // An id that is not a Spotify id (a local file) cannot be in the store.
    const askable = ids.filter((i) => SHARED_ID_PATTERN.test(i));
    const out: T[] = [];
    for (const part of chunks(askable)) {
      const asked = new Set(part);
      const res = await bounded((token) =>
        deps.client.rpc<unknown>(fn, token, { ids: part })
      );
      if (!res.ok) return res;
      if (!Array.isArray(res.value)) {
        return { ok: false, message: 'Unexpected answer: not a list' };
      }
      for (const raw of res.value) {
        const row = keep(raw, asked);
        if (row) out.push(row);
      }
    }
    return { ok: true, value: out };
  }

  async function share(
    fn: string,
    bodies: unknown[]
  ): Promise<PortResult<number>> {
    let sent = 0;
    for (const part of chunks(bodies)) {
      const res = await bounded((token) =>
        deps.client.rpc<unknown>(fn, token, { rows: part })
      );
      if (!res.ok) return res;
      sent += part.length;
    }
    return { ok: true, value: sent };
  }

  return {
    readTracks(ids) {
      return read('get_track_facts', ids, (raw, asked) => {
        const v = validateSharedTrackFact(raw, asked);
        return v.ok ? v.row : null;
      });
    },

    shareTracks(rows) {
      const bodies = rows
        .filter(
          (r) => SHARED_ID_PATTERN.test(r.trackId) && sharedTrackFactOk(r)
        )
        .map((r: SharedTrackFact) => ({
          track_id: r.trackId,
          bpm: r.bpm,
          key: r.key,
          major: r.major,
        }));
      return share('add_track_facts', bodies);
    },

    readReach(ids) {
      const now = deps.now();
      return read('get_artist_reach', ids, (raw, asked) => {
        const v = validateSharedReachFact(raw, asked, now);
        return v.ok ? v.row : null;
      });
    },

    shareReach(rows) {
      // The SQL window: today (UTC) minus 7 days to plus 1 day.
      const now = deps.now();
      const today = Date.parse(`${day(now)}T00:00:00Z`);
      const bodies = rows
        .filter(
          (r) =>
            SHARED_ID_PATTERN.test(r.artistId) &&
            (r.source === 'listenbrainz' || r.source === 'deezer') &&
            sharedReachValueOk(r.value) &&
            Number.isFinite(r.measuredAt) &&
            day(r.measuredAt) >= day(today - 7 * DAY_MS) &&
            day(r.measuredAt) <= day(today + DAY_MS)
        )
        .map((r: SharedReachFact) => ({
          artist_id: r.artistId,
          source: r.source,
          measured_on: day(r.measuredAt),
          value: r.value,
        }));
      return share('add_artist_reach', bodies);
    },
  };
}
