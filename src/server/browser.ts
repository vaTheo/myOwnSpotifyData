import { demoVariant } from '../dev/flag';
import { SUPABASE_KEY, SUPABASE_URL, redirectUri } from '../env';
import { createServerClient } from './client';
import { createServerSessionStore } from './session';

/**
 * False means "no server set up": the app is the browser-only app. The demo
 * (`yarn dev` with `?demo`, spec 003) never talks to the owner's server.
 */
export const serverConfigured =
  !(import.meta.env.DEV && demoVariant() !== null) &&
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
