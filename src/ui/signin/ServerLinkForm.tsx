import { useState } from 'preact/hooks';
import { msg } from '../../i18n';
import { serverLinkSent, startServerLink } from '../../model/state';
import { Button } from '../components/Button';
import { StatusLine } from '../components/StatusLine';
import { TextField } from '../components/TextField';

/**
 * The email-link form (research D3) shared by the sign-in screen and the
 * Settings server card: an email, **Send me a link** (Enter sends too), then
 * the notice that never says whether the address has an account (FR-003).
 */
export function ServerLinkForm() {
  const [email, setEmail] = useState('');
  const sent = serverLinkSent.value;
  const t = msg().signin.linkForm;
  return (
    <>
      <form
        class="settings-sign-in"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim() !== '') void startServerLink(email);
        }}
      >
        <TextField
          type="email"
          placeholder={t.email}
          aria-label={t.email}
          autocomplete="email"
          value={email}
          onValue={setEmail}
        />
        <Button type="submit" variant="filled" disabled={email.trim() === ''}>
          {t.send}
        </Button>
      </form>
      {sent !== null && <StatusLine kind="success">{t.sent(sent)}</StatusLine>}
    </>
  );
}
