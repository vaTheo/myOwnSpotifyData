import { auth } from '../../auth/browser';
import { canLikeTracks } from '../../features/like/likePlaylist';
import { canCreatePlaylists } from '../../features/mix/spotifySearch';
import { jobsBusy } from '../../model/state';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { StatusLine } from '../components/StatusLine';
import { sectionDomId } from './sections';

/**
 * The Spotify login (US5): signed in, and which of the two writes the
 * granted scopes still lack. A refresh never widens a scope, so the fix is
 * always Connect again (ADR-03); this section only reads the scopes.
 */
export function AccountSection() {
  const session = auth.session.value;
  const missing = [
    canLikeTracks(session) ? null : 'Like all songs',
    canCreatePlaylists(session) ? null : 'Create playlist',
  ].filter((s): s is string => s !== null);
  return (
    <Card
      id={sectionDomId('account')}
      class="settings-section"
      title="Spotify account"
      description="The Spotify login this browser reads your library with."
    >
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
      <div class="actions">
        <Button
          variant={session && missing.length > 0 ? 'filled' : 'tonal'}
          disabled={jobsBusy()}
          onClick={() => auth.logout()}
        >
          Connect again
        </Button>
      </div>
      <p class="muted">
        Connect again signs you out and back in. Nothing on this browser is
        deleted.
      </p>
    </Card>
  );
}
