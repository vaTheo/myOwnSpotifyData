import { auth } from '../auth/browser';
import {
  banner,
  connectSignOutVisible,
  serverSession,
  serverState,
  startServerSignOut,
} from '../model/state';
import { Button } from './components/Button';
import { StatusLine } from './components/StatusLine';
import { Icon } from './icons';
import { signedInLine } from './settings/lines';

/**
 * The sign-in card (spec 003, contracts/screens.md §2): what the app is,
 * what it reads, and — one tap away — the privacy statement, word for word
 * as before. Also the "Signing you in…" step while Spotify hands back.
 * Signed in to the server, it says as whom and offers Sign out (final review
 * I1): Settings is out of reach until Spotify is connected. No banner slot
 * here, so a refusal or a failure of Sign out is printed on the card.
 */
export function Connect(p: { signingIn?: boolean }) {
  const error = auth.lastAuthError.value;
  const session = connectSignOutVisible() ? serverSession.value : null;
  const state = serverState.value;
  const notice = banner.value;
  return (
    <main class="connect">
      <section class="connect-card">
        <Icon name="headphones" size={40} class="connect-mark" />
        <h1>DJ Data</h1>
        <p class="connect-purpose">
          Your Spotify listening, ranked for DJ set preparation.
        </p>
        {p.signingIn ? (
          <StatusLine>Signing you in…</StatusLine>
        ) : (
          <>
            <ul class="connect-reads">
              <li>Your top lists: 4 weeks, 6 months and all time</li>
              <li>The playlists you own, when you sync them</li>
              <li>Your listening history, when you import it</li>
            </ul>
            <details class="connect-privacy">
              <summary>What leaves this browser</summary>
              <p>
                Your most played tracks, your playlists ranked by plays, and the
                artists you have saved the most. Reads your top lists and the
                playlists you own. Nothing leaves this browser except the track
                ids sent to ReccoBeats when you look up BPM and key, and the
                artist ids, ISRCs and article titles sent to MusicBrainz,
                ListenBrainz, Deezer, Wikidata and Wikimedia when you look up
                artists.
              </p>
            </details>
            {session && (
              <StatusLine kind="success">
                {signedInLine(session.email)}
              </StatusLine>
            )}
            {session && state.status === 'error' && (
              <StatusLine kind="error">{state.message}</StatusLine>
            )}
            {notice && (
              <StatusLine kind={notice.kind === 'error' ? 'error' : 'warning'}>
                {notice.text}
              </StatusLine>
            )}
            {error && <StatusLine kind="error">{error}</StatusLine>}
            <button
              type="button"
              class="primary"
              onClick={() => void auth.beginLogin()}
            >
              Connect Spotify
            </button>
            {session && (
              <Button variant="tonal" onClick={() => void startServerSignOut()}>
                Sign out
              </Button>
            )}
          </>
        )}
      </section>
    </main>
  );
}
