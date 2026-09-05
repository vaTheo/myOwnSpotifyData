import type { ComponentChildren } from 'preact';

export function Badge(p: {
  kind?: 'plays' | 'top' | 'todo' | 'skip' | 'relation';
  children: ComponentChildren;
}) {
  return <span class={p.kind ? `badge ${p.kind}` : 'badge'}>{p.children}</span>;
}
