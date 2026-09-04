export const CLIENT_ID: string = import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '';

/** The app's own URL, registered verbatim in the Spotify dashboard. */
export function redirectUri(): string {
  return `${location.origin}${import.meta.env.BASE_URL}`;
}
