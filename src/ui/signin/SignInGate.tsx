import { msg } from '../../i18n';
import { serverState, spotifyReturnDropped } from '../../model/state';
import { StatusLine } from '../components/StatusLine';
import { Icon } from '../icons';
import { LanguageSwitch } from '../settings/LanguageSection';
import { gateNotices } from './gate';
import { ServerLinkForm } from './ServerLinkForm';

/**
 * The sign-in screen (round 011, contracts/ui.md): with a server set up and
 * nobody signed in, the whole app is this card. Nothing of any user is
 * rendered behind it (FR-002) and no account is created from it (FR-003):
 * the notice after sending never says whether the address has an account.
 * `linking`: the magic link is being exchanged.
 */
export function SignInGate(p: { linking?: boolean }) {
  const notices = gateNotices(serverState.value, spotifyReturnDropped.value);
  const t = msg().signin;
  return (
    <main class="connect">
      <section class="connect-card">
        <LanguageSwitch class="connect-lang" />
        <Icon name="headphones" size={40} class="connect-mark" />
        {/* eslint-disable-next-line no-restricted-syntax -- the app's name */}
        <h1>DJ Data</h1>
        <p class="connect-purpose">{t.gate.purpose}</p>
        {p.linking ? (
          <StatusLine>{t.signingIn}</StatusLine>
        ) : (
          <>
            {notices.map((n) =>
              n.kind === 'paused' ? (
                <StatusLine kind="warning" key="paused">
                  {t.gate.pausedBefore}
                  <a href={n.dashboardUrl} target="_blank" rel="noopener">
                    {t.gate.pausedLink}
                  </a>
                  {t.gate.pausedAfter}
                </StatusLine>
              ) : (
                <StatusLine kind={n.kind} key={n.text}>
                  {n.text}
                </StatusLine>
              )
            )}
            <ServerLinkForm />
          </>
        )}
      </section>
    </main>
  );
}
