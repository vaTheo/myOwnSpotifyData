import { demoVariant, memoryStorage } from '../dev/flag';
import { CLIENT_ID, redirectUri } from '../env';
import { scopeEnabled } from '../server/scopeBrowser';
import { scopedStorage } from '../server/userScope';
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
    // One Spotify login per server user (ADR-13): the device's claimer keeps
    // `session` and `pkce`, any other user `session:<id>` and `pkce:<id>`.
    return scopedStorage(
      localStorage,
      localStorage,
      [SESSION_KEY, PKCE_KEY],
      scopeEnabled()
    );
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

export const auth = createSessionStore({
  storage: sessionStorageFor(),
  fetchFn: (input, init) => fetch(input, init),
  now: () => Date.now(),
  navigate: (url) => location.assign(url),
  clientId: CLIENT_ID,
  redirectUri,
});
