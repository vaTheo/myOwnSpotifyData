import { auth } from '../../auth/browser';
import { canLikeTracks } from '../../features/like/likePlaylist';
import { canCreatePlaylists } from '../../features/mix/spotifySearch';
import { jobsBusy } from '../../model/state';
import { Button } from '../components/Button';
import { StatusLine } from '../components/StatusLine';
import { accountItemLine, type ItemLine } from './itemLines';

export const ACCOUNT_DESCRIPTION =
  'The Spotify login this browser reads your library with. It also allows the two writes you start with a tap: Create playlist and Like all songs.';

/** Which of the two writes the granted scopes still lack. */
function missingWrites(): string[] {
  const session = auth.session.value;
  return [
    canLikeTracks(session) ? null : 'Like all songs',
    canCreatePlaylists(session) ? null : 'Create playlist',
  ].filter((s): s is string => s !== null);
}

/** The closed line (spec 026). */
export function accountLine(): ItemLine {
  return accountItemLine(auth.session.value !== null, missingWrites());
}

/**
 * Connect again, the item's main button. A refresh never widens a scope, so
 * the fix is always Connect again (ADR-03); this item only reads the scopes.
 */
export function AccountMain() {
  const session = auth.session.value;
  return (
    <Button
      variant={session && missingWrites().length > 0 ? 'filled' : 'tonal'}
      disabled={jobsBusy()}
      onClick={() => auth.logout()}
    >
      Connect again
    </Button>
  );
}

/** The Spotify login (US5): signed in, and the writes still missing. */
export function AccountSection() {
  const session = auth.session.value;
  const missing = missingWrites();
  return (
    <>
      {session ? (
        <StatusLine kind="success">Signed in to Spotify.</StatusLine>
      ) : (
        <StatusLine>Not signed in to Spotify.</StatusLine>
      )}
      {session && missing.length > 0 && (
        <StatusLine kind="warning">
          Not allowed yet: {missing.join(', ')}. Connect again to allow{' '}
          {missing.length === 1 ? 'it' : 'them'}.
        </StatusLine>
      )}
      <p class="muted">
        Connect again signs you out and back in. Nothing in this browser is
        deleted.
      </p>
    </>
  );
}
