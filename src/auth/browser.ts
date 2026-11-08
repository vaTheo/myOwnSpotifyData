import { demoVariant, memoryStorage } from '../dev/flag';
import { CLIENT_ID, redirectUri } from '../env';
import { scopeEnabled, scopeStorage, scopedView } from '../server/scopeBrowser';
import { readDeviceUsers } from '../server/userScope';
import {
  PKCE_KEY,
  SCOPES,
  SESSION_KEY,
  createSessionStore,
  type StorageLike,
} from './session';

/**
 * The demo (`yarn dev` with `?demo`, spec 003) signs in with a session that
 * lives in memory and holds every scope; no Spotify call ever uses it, since
 * nothing reads Spotify on load. Outside `yarn dev` this is always
 * localStorage, seen through the active user's key names.
 */
function sessionStorageFor(): StorageLike {
  if (!import.meta.env.DEV || demoVariant() === null) {
    // One Spotify login per server user (ADR-14): the device's claimer keeps
    // `session` and `pkce`, any other user `session:<id>` and `pkce:<id>`.
    // The scope is pinned at page load (scopeBrowser), so another tab's
    // sign-in never moves this page onto another user's keys.
    return scopedView(localStorage, [SESSION_KEY, PKCE_KEY]);
  }
  // `?demo=signed-out` shows the Connect screen.
  if (demoVariant() === 'signed-out') return memoryStorage({});
  return memoryStorage({
    [SESSION_KEY]: JSON.stringify({
      accessToken: 'demo',
      expiresAt: Date.UTC(2100, 0, 1),
      refreshToken: 'demo',
      scope: SCOPES,
    }),
  });
}

/**
 * True when more than one person has signed in on this device (ADR-14): the
 * Spotify Connect then asks for Spotify's account screen, so the next person
 * is never connected to the previous one's still logged in Spotify account.
 * One person (or no server, or blocked storage): today's URL, unchanged.
 */
function sharedDevice(): boolean {
  const storage = scopeStorage();
  if (!scopeEnabled() || !storage) return false;
  try {
    return readDeviceUsers(storage).length > 1;
  } catch {
    return false;
  }
}

export const auth = createSessionStore({
  storage: sessionStorageFor(),
  fetchFn: (input, init) => fetch(input, init),
  now: () => Date.now(),
  navigate: (url) => location.assign(url),
  clientId: CLIENT_ID,
  redirectUri,
  showDialog: sharedDevice,
});
