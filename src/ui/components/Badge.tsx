import type { ComponentChildren } from 'preact';

export function Badge(p: {
  kind?: 'plays' | 'top' | 'todo' | 'skip';
  children: ComponentChildren;
}) {
  return <span class={p.kind ? `badge ${p.kind}` : 'badge'}>{p.children}</span>;
}
