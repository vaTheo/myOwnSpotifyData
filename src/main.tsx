import { render } from 'preact';
import { App, installRouter } from './app';
import { auth } from './auth/browser';
import { loadFromDb } from './model/state';
import { AuthError } from './spotify/errors';
import './styles.css';

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  if (params.has('code') || params.has('error')) {
    try {
      await auth.completeLogin(params);
    } catch (err) {
      auth.lastAuthError.value =
        err instanceof AuthError
          ? err.message
          : `Login failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    history.replaceState(null, '', location.pathname + location.hash);
  }
  installRouter();
  if (auth.session.value) await loadFromDb();
  render(<App />, document.getElementById('app')!);
}

void boot();
