import type { Session } from '../../auth/session';

/**
 * True only when the granted scope carries `playlist-modify-private`, so the
 * app may create a private playlist. Split on space and match the whole token,
 * not `String.includes`, so a hypothetical scope that merely *contains* the
 * substring (e.g. `playlist-modify-private-xyz`) can never satisfy it.
 */
export function canCreatePlaylists(session: Session | null): boolean {
  return (
    session !== null &&
    session.scope.split(' ').includes('playlist-modify-private')
  );
}
