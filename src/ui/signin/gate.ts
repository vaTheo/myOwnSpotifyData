import type { ServerStatus } from '../../server/types';

/**
 * The sign-in gate (round 009, ADR-13): with a server set up, the server
 * account is the user, so nobody signed in means nothing of anyone is shown.
 * Pure: `model/state.ts` and `main.tsx` feed it the live values.
 */
export function signInRequired(p: {
  /** Server settings are present (`serverConfigured`). */
  configured: boolean;
  /** The demo (`?demo`), which never talks to the server. */
  demo: boolean;
  /** A server session is stored on this device. */
  signedIn: boolean;
}): boolean {
  return p.configured && !p.demo && !p.signedIn;
}

/**
 * What boot does once a magic link is exchanged. A working link loads the
 * page again without the code (under the new user's names). A failed one
 * stays on this page: loading again would lose the message (Principle VII).
 */
export function afterLink(
  result: 'none' | 'ok' | 'reload' | 'invalid'
): 'navigate' | 'stay' {
  return result === 'invalid' ? 'stay' : 'navigate';
}

export type GateNotice =
  | { kind: 'error' | 'warning'; text: string }
  | { kind: 'paused'; dashboardUrl: string };

/** Shown when Spotify hands back to the app while nobody is signed in. */
export const SPOTIFY_BEFORE_SIGNIN_MESSAGE =
  'Sign in to the app first, then connect Spotify again.';

/**
 * The lines the sign-in screen shows: the server's state, then a Spotify
 * return that arrived while nobody was signed in (it is not used: there is
 * no user to keep it for, Principle VII says why).
 */
export function gateNotices(
  state: ServerStatus,
  spotifyDropped: boolean
): GateNotice[] {
  const out: GateNotice[] = [];
  switch (state.status) {
    case 'error':
      out.push({ kind: 'error', text: state.message });
      break;
    case 'offline':
      out.push({
        kind: 'warning',
        text: `Server offline: ${state.message} Send the link again once you are online.`,
      });
      break;
    case 'paused':
      out.push({ kind: 'paused', dashboardUrl: state.dashboardUrl });
      break;
    default:
      break;
  }
  if (spotifyDropped) {
    out.push({ kind: 'error', text: SPOTIFY_BEFORE_SIGNIN_MESSAGE });
  }
  return out;
}

/**
 * Whether boot runs the open's server sync and jobs. Not after a failed
 * link with someone still signed in: the pull would replace the link's
 * message on the Settings card before it is read. The next return to the
 * app, the network coming back or **Sync now** runs them as usual.
 */
export function syncOnOpen(
  link: 'none' | 'ok' | 'reload' | 'invalid' | null
): boolean {
  return link !== 'invalid';
}
