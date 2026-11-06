import type { ComponentChildren } from 'preact';

/**
 * A Material 3 filled card (spec 003): `surface-container`, medium corners.
 * The title is an h2, so a page of cards reads as one heading outline.
 */
export function Card(p: {
  title?: ComponentChildren;
  description?: ComponentChildren;
  id?: string;
  class?: string;
  children?: ComponentChildren;
}) {
  return (
    <section id={p.id} class={p.class ? `card ${p.class}` : 'card'}>
      {p.title && <h2>{p.title}</h2>}
      {p.description && <p class="card-description">{p.description}</p>}
      {p.children}
    </section>
  );
}
