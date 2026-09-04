import type { ComponentChildren } from 'preact';

export function Badge(p: {
  kind?: 'plays' | 'top';
  children: ComponentChildren;
}) {
  return <span class={p.kind ? `badge ${p.kind}` : 'badge'}>{p.children}</span>;
}
