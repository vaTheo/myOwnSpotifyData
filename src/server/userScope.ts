import type { StorageLike } from '../auth/session';

/**
 * Who owns the data on this device (ADR-14). The server account is the user.
 * The first user to sign in on a device claims today's names (the database
 * `spotify-dj`, the Spotify keys `session` and `pkce`); every other user gets
 * the same names with their id added. Nothing is copied or renamed, which is
 * what Principle V requires. Pure: storage is injected.
 */

export const DEVICE_OWNER_KEY = 'deviceOwner';
export const ACTIVE_KEY = 'activeUser';
export const DEVICE_USERS_KEY = 'deviceUsers';

export interface ActiveUser {
  userId: string;
  email: string;
}

const USER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A user id goes into a database name and a storage key: only a uuid shape does. */
export function isUserId(value: unknown): value is string {
  return typeof value === 'string' && USER_ID.test(value);
}

function readJson(storage: StorageLike, key: string): unknown {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function asUser(value: unknown): ActiveUser | null {
  if (typeof value !== 'object' || value === null) return null;
  const { userId, email } = value as Record<string, unknown>;
  if (!isUserId(userId)) return null;
  return { userId, email: typeof email === 'string' ? email : '' };
}

/** The `sub` claim of an access token, or null when it is not a well-formed one. */
export function userIdFromToken(token: string): string | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return isUserId(sub) ? sub : null;
  } catch {
    return null;
  }
}

export function readActive(storage: StorageLike): ActiveUser | null {
  return asUser(readJson(storage, ACTIVE_KEY));
}

export function writeActive(
  storage: StorageLike,
  user: ActiveUser | null
): void {
  if (user) storage.setItem(ACTIVE_KEY, JSON.stringify(user));
  else storage.removeItem(ACTIVE_KEY);
}

function readOwner(storage: StorageLike): string | null {
  const v = readJson(storage, DEVICE_OWNER_KEY);
  const id = (v as { userId?: unknown } | null)?.userId;
  return isUserId(id) ? id : null;
}

/** The first sign-in on a device claims the existing names; later ones never change it. */
export function claim(storage: StorageLike, userId: string): string {
  const owner = readOwner(storage);
  if (owner) return owner;
  storage.setItem(DEVICE_OWNER_KEY, JSON.stringify({ userId }));
  return userId;
}

/** `''` for the claimer, nobody, or no server; `<id>` for any other user. */
export function scopeOf(storage: StorageLike, enabled: boolean): string {
  if (!enabled) return '';
  const active = readActive(storage);
  if (!active) return '';
  const owner = readOwner(storage);
  return owner === active.userId ? '' : active.userId;
}

/** The database name for a scope id from `scopeOf`. */
export function dbNameIn(base: string, scope: string): string {
  return scope ? `${base}-u-${scope}` : base;
}

/** The storage key for a scope id from `scopeOf`. */
export function keyIn(base: string, scope: string): string {
  return scope ? `${base}:${scope}` : base;
}

export function dbNameFor(
  base: string,
  storage: StorageLike,
  enabled: boolean
): string {
  return dbNameIn(base, scopeOf(storage, enabled));
}

export function keyFor(
  base: string,
  storage: StorageLike,
  enabled: boolean
): string {
  return keyIn(base, scopeOf(storage, enabled));
}

/**
 * A `storage` event from another tab (`key`, null for a clear) changed who is
 * active on the device: true when the scope it now resolves to is not the one
 * this page pinned at load, so the page must reload (FR-002).
 */
export function scopeChangedElsewhere(
  key: string | null,
  storage: StorageLike,
  enabled: boolean,
  pinned: string
): boolean {
  if (key !== null && key !== ACTIVE_KEY && key !== DEVICE_OWNER_KEY) {
    return false;
  }
  return scopeOf(storage, enabled) !== pinned;
}

/** The server session's key (`session.ts` SESSION_KEY; a test keeps them equal). */
export const SERVER_SESSION_KEY = 'server-session';

/**
 * A `storage` event from another tab (`key`, null for a clear; `newValue`)
 * started or ended the server session: true when this page must reload. A
 * page on the sign-in screen reloads when a session appears; a signed-in
 * page reloads when it disappears, even when the scope stays the same (the
 * claimer signing out elsewhere moves no name, so `scopeChangedElsewhere`
 * says nothing). A refresh rewriting the session is not a change.
 */
export function sessionChangedElsewhere(
  key: string | null,
  newValue: string | null,
  signedInHere: boolean
): boolean {
  if (key === null) return signedInHere;
  if (key !== SERVER_SESSION_KEY) return false;
  return signedInHere ? newValue === null : newValue !== null;
}

/** True when the page must reload to leave one user's data for another's. */
export function reloadNeeded(
  previous: string | null,
  next: string | null
): boolean {
  return previous !== null && previous !== next;
}

export function readDeviceUsers(storage: StorageLike): ActiveUser[] {
  const v = readJson(storage, DEVICE_USERS_KEY);
  if (!Array.isArray(v)) return [];
  return v.map(asUser).filter((u): u is ActiveUser => u !== null);
}

export function recordDeviceUser(storage: StorageLike, user: ActiveUser): void {
  const users = readDeviceUsers(storage);
  const i = users.findIndex((u) => u.userId === user.userId);
  if (i >= 0) users[i] = user;
  else users.push(user);
  storage.setItem(DEVICE_USERS_KEY, JSON.stringify(users));
}

/**
 * A view of `storage` where the listed keys resolve through `keyFor` at every
 * call (so a change of user is seen) and every other key is left alone.
 */
export function scopedStorage(
  storage: StorageLike,
  scopeSource: StorageLike,
  keys: readonly string[],
  enabled: boolean
): StorageLike {
  const map = (key: string): string =>
    keys.includes(key) ? keyFor(key, scopeSource, enabled) : key;
  return {
    getItem: (key) => storage.getItem(map(key)),
    setItem: (key, value) => storage.setItem(map(key), value),
    removeItem: (key) => storage.removeItem(map(key)),
  };
}

export type Activation = { ok: true; reload: boolean } | { ok: false };

/**
 * Makes a signed-in server account the device's active user: the first one
 * claims today's names, the pointer is written, the user is remembered. A
 * reload is needed when the user changed, or when the names the page opened
 * with are not the new user's (someone else signing in while nobody was
 * active): no in-memory singleton may keep another user's data (ADR-14).
 * An id that is not a uuid is refused and nothing is written.
 */
export function activate(
  storage: StorageLike,
  user: { userId: string | null; email: string },
  enabled: boolean
): Activation {
  const { userId, email } = user;
  if (!isUserId(userId)) return { ok: false };
  const previous = readActive(storage)?.userId ?? null;
  const before = keyFor('', storage, enabled);
  claim(storage, userId);
  writeActive(storage, { userId, email });
  recordDeviceUser(storage, { userId, email });
  const after = keyFor('', storage, enabled);
  return {
    ok: true,
    reload: reloadNeeded(previous, userId) || before !== after,
  };
}
