/**
 * One Spotify quota lock-out for the whole app (spec 003 S08d, ADR-02).
 * When Spotify answers with its quota (`QuotaError`), no reader (sync,
 * Check on Spotify, Create playlist, Like all songs) reads Spotify until
 * the end it named. The end is kept in localStorage, so it survives a
 * reload and Disconnect (the quota belongs to the app's client id, not to
 * the session). Pure: `state.ts` holds the signal, the storage and the
 * timer that clears it when it lapses.
 */

/** The localStorage key holding the lock's end (epoch ms). */
export const QUOTA_LOCK_KEY = 'spotifyQuotaLock';

/** The longest delay `setTimeout` takes (2^31 − 1 ms, about 24.8 days). */
export const MAX_TIMER_MS = 2_147_483_647;

/** The lock's end while it holds, else null. */
export function activeLock(until: number | null, now: number): number | null {
  return until !== null && until > now ? until : null;
}

/** The later of the held end and a new one. */
export function laterLock(current: number | null, retryAt: number): number {
  return current === null ? retryAt : Math.max(current, retryAt);
}

/** The stored end, when it is a finite number still ahead, else null. */
export function parseStoredLock(
  raw: string | null,
  now: number
): number | null {
  if (raw === null || raw.trim() === '') return null;
  const until = Number(raw);
  return Number.isFinite(until) ? activeLock(until, now) : null;
}

/** How long the lapse timer waits (re-armed when capped). */
export function lapseDelay(until: number, now: number): number {
  return Math.min(Math.max(0, until - now), MAX_TIMER_MS);
}

/** Who reads Spotify; 'account' is the `/me` call on the Connect tap,
 *  whose check the next sync makes again. */
export type SpotifyReader = 'sync' | 'check' | 'create' | 'like' | 'account';

const AGAIN: Record<SpotifyReader, string> = {
  sync: 'Sync again',
  check: 'Check again',
  create: 'Try again',
  like: 'Try again',
  account: 'Sync again',
};

/** The reader's refusal while the lock holds, else null (it may read). */
export function quotaRefusal(
  reader: SpotifyReader,
  until: number | null,
  now: number,
  format: (ms: number) => string
): string | null {
  const held = activeLock(until, now);
  return held === null
    ? null
    : `Spotify quota reached. ${AGAIN[reader]} after ${format(held)}.`;
}

/* ---------- one Spotify reader at a time (S13) ---------- */

/** The readers that may run for a while; the Connect `/me` call is one
 *  request on a tap and never runs beside them. */
export type LongReader = Exclude<SpotifyReader, 'account'>;

/** Which long readers are running now. */
export type RunningReaders = Record<LongReader, boolean>;

const READER_ORDER: readonly LongReader[] = ['sync', 'check', 'create', 'like'];

const READER_NAME: Record<LongReader, string> = {
  sync: 'A sync',
  check: 'Check on Spotify',
  create: 'Create playlist',
  like: 'Like all songs',
};

const READER_VERB: Record<SpotifyReader, string> = {
  sync: 'sync',
  check: 'check',
  create: 'create the playlist',
  like: 'like the songs',
  account: 'connect',
};

/** Another reader running beside `asking`, or null: two at once double the
 *  request rate toward the quota lock-out (ADR-02). */
export function busyReader(
  running: RunningReaders,
  asking: SpotifyReader
): LongReader | null {
  return READER_ORDER.find((r) => r !== asking && running[r]) ?? null;
}

/** The refusal while another reader runs, else null (it may read). */
export function busyRefusal(
  running: RunningReaders,
  asking: SpotifyReader
): string | null {
  const busy = busyReader(running, asking);
  return busy === null
    ? null
    : `${READER_NAME[busy]} is reading Spotify: ${READER_VERB[asking]} once it ends.`;
}
