import { useState } from 'preact/hooks';
import {
  serverLinkSent,
  serverState,
  startServerLink,
} from '../../model/state';
import { Button } from '../components/Button';
import { StatusLine } from '../components/StatusLine';
import { TextField } from '../components/TextField';
import { Icon } from '../icons';
import { gateNotice } from './gate';

/**
 * The sign-in screen (round 009, contracts/ui.md): with a server set up and
 * nobody signed in, the whole app is this card. Nothing of any user is
 * rendered behind it (FR-002) and no account is created from it (FR-003):
 * the notice after sending never says whether the address has an account.
 * `linking`: the magic link is being exchanged.
 */
export function SignInGate(p: { linking?: boolean }) {
  const [email, setEmail] = useState('');
  const sent = serverLinkSent.value;
  const notice = gateNotice(serverState.value);
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
            {notice?.kind === 'error' && (
              <StatusLine kind="error">{notice.text}</StatusLine>
            )}
            {notice?.kind === 'warning' && (
              <StatusLine kind="warning">{notice.text}</StatusLine>
            )}
            {notice?.kind === 'paused' && (
              <StatusLine kind="warning">
                Server paused. Resume it from the{' '}
                <a href={notice.dashboardUrl} target="_blank" rel="noopener">
                  Supabase dashboard
                </a>
                , then send the link again.
              </StatusLine>
            )}
            <form
              class="settings-sign-in"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim() !== '') void startServerLink(email);
              }}
            >
              <TextField
                type="email"
                placeholder="Email"
                aria-label="Email"
                autocomplete="email"
                value={email}
                onValue={setEmail}
              />
              <Button
                type="submit"
                variant="filled"
                disabled={email.trim() === ''}
              >
                Send me a link
              </Button>
            </form>
            {sent !== null && (
              <StatusLine kind="success">
                If this email has an account, a link was sent to {sent}. Open it
                in this browser within 10 minutes.
              </StatusLine>
            )}
          </>
        )}
      </section>
    </main>
  );
}
