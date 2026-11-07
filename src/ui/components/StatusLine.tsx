import type { ComponentChildren } from 'preact';
import { Icon, type IconName } from '../icons';

export type StatusKind = 'info' | 'warning' | 'error' | 'success';

const ICON: Record<StatusKind, IconName> = {
  info: 'info',
  warning: 'warning',
  error: 'error',
  success: 'check',
};

/** An error interrupts (`alert`); the rest is said politely (`status`). */
const ROLE: Record<StatusKind, 'alert' | 'status'> = {
  info: 'status',
  warning: 'status',
  error: 'alert',
  success: 'status',
};

/**
 * One line of status with its icon (spec 003, FR-012): a warning or an error
 * is never told by colour alone. Inline failures (Mix, Like, Settings) use
 * the `error` kind; they are never banners. Each line is a live region
 * (S13 A9), announced when it appears or its text changes, not on a render
 * that leaves it as it was.
 */
export function StatusLine(p: {
  kind?: StatusKind;
  children: ComponentChildren;
  class?: string;
}) {
  const kind = p.kind ?? 'info';
  return (
    <p
      class={['status', `status-${kind}`, p.class].filter(Boolean).join(' ')}
      role={ROLE[kind]}
    >
      <Icon name={ICON[kind]} size={18} />
      <span>{p.children}</span>
    </p>
  );
}
