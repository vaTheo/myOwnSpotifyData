import { useEffect, useRef, useState } from 'preact/hooks';
import { Button } from '../components/Button';
import { StatusLine } from '../components/StatusLine';
import { TextField } from '../components/TextField';

/**
 * Round 011: paste a Spotify track link on a row (opened from the red
 * "not found" mark). Link hands the text to `onLink`, which returns the
 * refusal to show under the field, or null when the row was linked. The
 * link is stored by its id, never looked up (ADR-02, ADR-04). It takes the
 * focus and scrolls into view when it opens, as the Edit form does.
 */
export function LinkForm(p: {
  name: string;
  initial?: string;
  onLink: (text: string) => string | null;
  onCancel: () => void;
  onRemove?: () => void;
}) {
  const [text, setText] = useState(p.initial ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current
      ?.querySelector<HTMLInputElement>('input')
      ?.focus({ preventScroll: true });
    form.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  return (
    <form
      class="mix-link"
      ref={form}
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(p.onLink(text));
      }}
    >
      <span class="mix-link-name">{p.name}</span>
      <TextField
        label="Spotify track link"
        type="text"
        inputMode="url"
        autoComplete="off"
        spellcheck={false}
        placeholder="https://open.spotify.com/track/…"
        value={text}
        onValue={(v) => {
          setText(v);
          setMessage(null);
        }}
      />
      <div class="mix-link-actions">
        <Button variant="filled" type="submit">
          Link
        </Button>
        <Button variant="text" onClick={p.onCancel}>
          Cancel
        </Button>
        {p.onRemove && (
          <Button variant="text" onClick={p.onRemove}>
            Remove link
          </Button>
        )}
      </div>
      {message !== null && <StatusLine kind="error">{message}</StatusLine>}
    </form>
  );
}
