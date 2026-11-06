import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

/**
 * A collapsed section with a 48 px summary. Its content is rendered only
 * while open, so a closed section holds no hidden fields or links (and its
 * state, kept by the caller, survives a close).
 */
export function Disclosure(p: {
  summary: ComponentChildren;
  class?: string;
  children: ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      class={p.class ? `mix-section ${p.class}` : 'mix-section'}
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>{p.summary}</summary>
      {open && p.children}
    </details>
  );
}
