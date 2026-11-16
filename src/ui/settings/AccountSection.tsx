import { auth } from '../../auth/browser';
import { canLikeTracks } from '../../features/like/likePlaylist';
import { canCreatePlaylists } from '../../features/mix/spotifySearch';
import { msg } from '../../i18n';
import { jobsBusy } from '../../model/state';
import { Button } from '../components/Button';
import { StatusLine } from '../components/StatusLine';
import { accountItemLine, type ItemLine } from './itemLines';

/** The item's description, read when drawn (spec 031). */
export function accountDescription(): string {
  return msg().settings.account.description;
}

/** Which of the two writes the granted scopes still lack. */
function missingWrites(): string[] {
  const session = auth.session.value;
  const text = msg().settings.account;
  return [
    canLikeTracks(session) ? null : text.likeAll,
    canCreatePlaylists(session) ? null : text.createPlaylist,
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
      {msg().settings.closed.connectAgain}
    </Button>
  );
}

/** The Spotify login (US5): signed in, and the writes still missing. */
export function AccountSection() {
  const session = auth.session.value;
  const missing = missingWrites();
  const text = msg().settings.account;
  return (
    <>
      {session ? (
        <StatusLine kind="success">{text.signedIn}</StatusLine>
      ) : (
        <StatusLine>{text.notSignedIn}</StatusLine>
      )}
      {session && missing.length > 0 && (
        <StatusLine kind="warning">
          {text.notAllowed(missing.join(', '), missing.length)}
        </StatusLine>
      )}
      <p class="muted">{text.note}</p>
    </>
  );
}
