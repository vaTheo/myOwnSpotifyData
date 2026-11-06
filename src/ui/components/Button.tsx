import type { ComponentChildren, JSX } from 'preact';
import { Icon, type IconName } from '../icons';

export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'danger';

/**
 * Material 3 common buttons (spec 003, contracts/components.md). One filled
 * button per section at most: the main action. `danger` is outlined in the
 * error colour, never white on red (visual backlog B7). Every variant keeps
 * a 48 px hit area (FR-045).
 */
export function Button(
  p: {
    variant?: ButtonVariant;
    icon?: IconName;
    children: ComponentChildren;
  } & Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'icon'>
) {
  const { variant = 'tonal', icon, children, class: extra, ...rest } = p;
  const classes = ['btn', `btn-${variant}`, extra].filter(Boolean).join(' ');
  return (
    <button type="button" {...rest} class={classes}>
      {icon && <Icon name={icon} size={18} />}
      <span>{children}</span>
    </button>
  );
}
