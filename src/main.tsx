import { render } from 'preact';
import { App, bootPhase, installRouter } from './app';
import { auth } from './auth/browser';
import { demoVariant } from './dev/flag';
import {
  completeServerLink,
  hasActiveRequest,
  loadFromDb,
  recordConnectedAccount,
  runAutoChain,
  serverAutoSyncEnabled,
  startServerPull,
  startServerSync,
} from './model/state';
import { installAutoSync } from './server/autoSync';
import { LINK_MARKER } from './server/session';
import { AuthError } from './spotify/errors';
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
  if (returning) bootPhase.value = 'signin';
  else bootPhase.value = auth.session.value ? 'loading' : 'ready';
  installRouter();
  render(<App />, document.getElementById('app')!);
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
  if (serverLink) {
    await completeServerLink(params);
    // Drop the code from the URL and land on Settings, where the card says
    // whether the link worked; a same-document replace, no reload.
    location.replace(location.pathname + '#/settings');
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
  if (auth.session.value) await startServerSync();
  // Then the jobs that keep the library current (round 006, ADR-12): the
  // Spotify sync when the library is older than 12 hours, the BPM and key
  // run, Artist reach; one at a time, only what is missing. Never on the
  // demo: it has no Spotify session to read with (the shots block the host).
  const runChain = () => {
    if (!(import.meta.env.DEV && demoVariant() !== null)) runAutoChain();
  };
  runChain();
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
    enabled: () => !serverAutoSyncEnabled() && auth.session.value !== null,
    hasActiveRequest: () => false,
    sync: async () => runChain(),
    pull: async () => {},
  });
}

void boot();
