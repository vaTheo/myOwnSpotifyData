import { render } from 'preact';
import { App, bootPhase, installRouter, route } from './app';
import { auth } from './auth/browser';
import { demoVariant } from './dev/flag';
import {
  activateServerUser,
  completeServerLink,
  hasActiveRequest,
  loadFromDb,
  recordConnectedAccount,
  runAutoChain,
  serverSignInRequired,
  spotifyReturnDropped,
  serverAutoSyncEnabled,
  startServerPull,
  startServerSync,
} from './model/state';
import { installAutoSync } from './server/autoSync';
import { watchScope } from './server/scopeBrowser';
import { LINK_MARKER } from './server/session';
import { parseRoute } from './router';
import { AuthError } from './spotify/errors';
import { afterLink, syncOnOpen } from './ui/signin/gate';
import './ui/theme/tokens.css';
import './styles.css';

/**
 * The shell is painted before anything is awaited: the token exchange and the
 * IndexedDB read both take long enough on a phone to look like a crash on a
 * blank page. Every await below therefore comes after `render`.
 */
async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  // The server's magic link and Spotify's PKCE callback both come back with
  // `?code=`; the `link=server` marker is what tells them apart (S2).
  const serverLink = params.get('link') === LINK_MARKER;
  const returning = !serverLink && (params.has('code') || params.has('error'));
  // A server session stored on this device is the active user (ADR-13); the
  // owner's session from before this round claims today's names here, with
  // no reload. A magic link activates its own account below instead.
  const activated = serverLink ? 'none' : activateServerUser();
  if (activated === 'reload') {
    location.reload();
    return;
  }
  // Another tab signing in or out as someone else reloads this one (FR-002).
  watchScope();
  // A server is set up and nobody is signed in to it (or the stored session
  // was just refused): only the sign-in screen, and nothing is read, synced
  // or started (round 009, FR-002).
  const signedOut =
    !serverLink && (activated === 'invalid' || serverSignInRequired());
  if (serverLink) bootPhase.value = 'linking';
  else if (signedOut) bootPhase.value = 'signedout';
  else if (returning) bootPhase.value = 'signin';
  else bootPhase.value = auth.session.value ? 'loading' : 'ready';
  installRouter();
  render(<App />, document.getElementById('app')!);
  if (signedOut) {
    // A Spotify callback landing here has no user to belong to: not used,
    // and the sign-in screen says so (Principle VII).
    if (returning) {
      spotifyReturnDropped.value = true;
      history.replaceState(
        history.state,
        '',
        location.pathname + location.hash
      );
    }
    return;
  }
  let linked: Awaited<ReturnType<typeof completeServerLink>> | null = null;
  if (serverLink) {
    linked = await completeServerLink(params);
    if (afterLink(linked) === 'navigate') {
      // Drop the code from the URL and land on Settings. The navigation
      // loads the page again: under the new user's names when the account
      // differs (ADR-13), never `location.reload()`, which would replay the
      // spent code. Nothing more runs on this page.
      location.replace(location.pathname + '#/settings');
      return;
    }
    // A failed link stays on this page, so its message stays on screen
    // (reloading would lose it): drop the spent code, then go on as an open.
    history.replaceState(history.state, '', location.pathname + '#/settings');
    route.value = parseRoute(location.hash);
    const again = activateServerUser();
    if (again === 'reload') {
      location.reload();
      return;
    }
    if (again === 'invalid' || serverSignInRequired()) {
      bootPhase.value = 'signedout';
      return;
    }
    bootPhase.value = auth.session.value ? 'loading' : 'ready';
  }
  if (returning) {
    try {
      // One `/me` call on the Connect tap, never on load (research D11).
      if ((await auth.completeLogin(params)) === 'ok') {
        await recordConnectedAccount();
      }
    } catch (err) {
      auth.lastAuthError.value =
        err instanceof AuthError
          ? err.message
          : `Login failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    // Keep the entry state: `installRouter` has already stamped this entry.
    history.replaceState(history.state, '', location.pathname + location.hash);
  }
  if (auth.session.value) {
    bootPhase.value = 'loading';
    // `yarn dev` with `?demo` only (spec 003): a production build drops the
    // whole branch, and with it the demo module.
    if (import.meta.env.DEV) {
      const variant = demoVariant();
      if (variant !== null) {
        await (await import('./dev/install')).installDemo(variant);
      }
    }
    await loadFromDb();
  }
  bootPhase.value = 'ready';
  // The shots wait for this mark before they look at a page (spec 003).
  if (import.meta.env.DEV && demoVariant() !== null) {
    (await import('./dev/ChartsDemo')).installChartsDemo(() =>
      render(<App />, document.getElementById('app')!)
    );
    document.documentElement.dataset.demoReady = '1';
  }
  // After the first paint and the local load: a slow or paused server never
  // delays "Loading your library…" (US3). Whatever this device changed while
  // the server was unreachable goes first, then the pull.
  // Held after a failed link: the pull would replace its message (gate.ts).
  const openSync = syncOnOpen(linked);
  if (auth.session.value && openSync) await startServerSync();
  // Then the jobs that keep the library current (round 006, ADR-12): the
  // Spotify sync when the library is older than 12 hours, the BPM and key
  // run, Artist reach; one at a time, only what is missing. Never on the
  // demo: it has no Spotify session to read with (the shots block the host).
  // Nor once the server session has ended (the sign-in screen is back).
  const runChain = () => {
    if (import.meta.env.DEV && demoVariant() !== null) return;
    if (serverSignInRequired()) return;
    runAutoChain();
  };
  if (openSync) runChain();
  // Then the server keeps itself current: on return to the app, when the
  // network is back, and every minute while a request runs on the computer.
  installAutoSync({
    doc: document,
    win: window,
    now: Date.now,
    enabled: serverAutoSyncEnabled,
    hasActiveRequest,
    sync: async () => {
      await startServerSync();
      runChain();
    },
    pull: async () => {
      await startServerPull();
    },
  });
  // Without the server, the same return-to-the-app triggers run the chain
  // alone (round 006): the two installs are never enabled together.
  installAutoSync({
    doc: document,
    win: window,
    now: Date.now,
    enabled: () =>
      !serverAutoSyncEnabled() &&
      !serverSignInRequired() &&
      auth.session.value !== null,
    hasActiveRequest: () => false,
    sync: async () => runChain(),
    pull: async () => {},
  });
}

void boot();
