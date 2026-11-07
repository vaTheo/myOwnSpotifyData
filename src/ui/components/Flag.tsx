import type { ComponentChildren } from 'preact';
import { Icon } from '../icons';

/**
 * A small non-interactive chip (spec 003): what `Badge` was. The kinds keep
 * Badge's meanings; `todo` ("not in a playlist") also carries a warning
 * icon so it is not told by colour alone (FR-012).
 */
export type FlagKind =
  'plays' | 'high' | 'top' | 'new' | 'todo' | 'skip' | 'relation' | 'pending';

export function Flag(p: { kind?: FlagKind; children: ComponentChildren }) {
  return (
    <span class={p.kind ? `flag flag-${p.kind}` : 'flag'}>
      {p.kind === 'todo' && <Icon name="warning" size={14} />}
      {p.children}
    </span>
  );
}
