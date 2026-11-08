import { serverState, spotifyReturnDropped } from '../../model/state';
import { StatusLine } from '../components/StatusLine';
import { Icon } from '../icons';
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
  return (
    <main class="connect">
      <section class="connect-card">
        <Icon name="headphones" size={40} class="connect-mark" />
        <h1>DJ Data</h1>
        <p class="connect-purpose">
          Sign in with a link sent to your email. Open the link in this browser,
          within 10 minutes.
        </p>
        {p.linking ? (
          <StatusLine>Signing you in…</StatusLine>
        ) : (
          <>
            {notices.map((n) =>
              n.kind === 'paused' ? (
                <StatusLine kind="warning" key="paused">
                  Server paused. Resume it from the{' '}
                  <a href={n.dashboardUrl} target="_blank" rel="noopener">
                    Supabase dashboard
                  </a>
                  , then send the link again.
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
