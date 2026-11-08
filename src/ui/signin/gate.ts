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

/** The line the sign-in screen shows for the server's state, or null. */
export function gateNotice(state: ServerStatus): GateNotice | null {
  switch (state.status) {
    case 'error':
      return { kind: 'error', text: state.message };
    case 'offline':
      return {
        kind: 'warning',
        text: `Server offline: ${state.message} Send the link again once you are online.`,
      };
    case 'paused':
      return { kind: 'paused', dashboardUrl: state.dashboardUrl };
    default:
      return null;
  }
}
