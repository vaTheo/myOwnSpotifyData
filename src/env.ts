export const CLIENT_ID: string = import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '';

/**
 * The owner's server (ADR-08): a Supabase project URL and its publishable
 * key. Both are public values; empty means "no server set up" and the app is
 * the browser-only app.
 */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_KEY ?? '';

/** The app's own URL, registered verbatim in the Spotify dashboard. */
export function redirectUri(): string {
  return `${location.origin}${import.meta.env.BASE_URL}`;
}
