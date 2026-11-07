import { demoVariant } from '../dev/flag';
import { SUPABASE_KEY, SUPABASE_URL, redirectUri } from '../env';
import { createServerClient } from './client';
import { createServerSessionStore } from './session';

/**
 * False means "no server set up": the app is the browser-only app. The demo
 * (`yarn dev` with `?demo`, spec 003) never talks to the owner's server.
 * One dev-only exception: `yarn regression` starts a second dev server with
 * `VITE_DEMO_FAKE_SERVER=1` and a fake 127.0.0.1 server address, so the
 * demo reaches the questions asked before any server call (S14, C03).
 */
const demoFakeServer =
  import.meta.env.DEV && import.meta.env.VITE_DEMO_FAKE_SERVER === '1';

export const serverConfigured =
  (!(import.meta.env.DEV && demoVariant() !== null) || demoFakeServer) &&
  SUPABASE_URL !== '' &&
  SUPABASE_KEY !== '';

export const serverClient = createServerClient({
  // Bare `fetch` throws "Illegal invocation" once unbound from window.
  fetchFn: (input, init) => fetch(input, init),
  baseUrl: SUPABASE_URL,
  apiKey: SUPABASE_KEY,
  now: () => Date.now(),
});

export const serverAuth = createServerSessionStore({
  client: serverClient,
  storage: localStorage,
  now: () => Date.now(),
  redirectUri,
});
