import { auth } from '../auth/browser';
import { msg } from '../i18n';
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
import { LanguageSwitch } from './settings/LanguageSection';
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
  const t = msg().signin;
  return (
    <main class="connect">
      <section class="connect-card">
        <LanguageSwitch class="connect-lang" />
        <Icon name="headphones" size={40} class="connect-mark" />
        {/* eslint-disable-next-line no-restricted-syntax -- the app's name */}
        <h1>DJ Data</h1>
        <p class="connect-purpose">{t.connect.purpose}</p>
        {p.signingIn ? (
          <StatusLine>{t.signingIn}</StatusLine>
        ) : (
          <>
            <ul class="connect-reads">
              <li>{t.connect.readsTop}</li>
              <li>{t.connect.readsPlaylists}</li>
              <li>{t.connect.readsHistory}</li>
            </ul>
            <details class="connect-privacy">
              <summary>{t.connect.privacySummary}</summary>
              <p>{t.connect.privacy}</p>
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
              {t.connect.connectSpotify}
            </button>
            {session && (
              <Button variant="tonal" onClick={() => void startServerSignOut()}>
                {t.connect.signOut}
              </Button>
            )}
          </>
        )}
      </section>
    </main>
  );
}
