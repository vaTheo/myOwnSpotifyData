import { render } from 'preact';
import { App, bootPhase, installRouter } from './app';
import { auth } from './auth/browser';
import { completeServerLink, loadFromDb } from './model/state';
import { LINK_MARKER } from './server/session';
import { AuthError } from './spotify/errors';
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
      await auth.completeLogin(params);
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
    await loadFromDb();
  }
  bootPhase.value = 'ready';
}

void boot();
