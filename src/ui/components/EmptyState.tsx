import type { ComponentChildren } from 'preact';
import { Icon, type IconName } from '../icons';

/**
 * Why a screen is empty, and the one action that fixes it (spec 003,
 * FR-040). The action is a link or a button, never both.
 */
export function EmptyState(p: {
  icon?: IconName;
  children: ComponentChildren;
  action?: { label: string; href?: string; onClick?: () => void };
}) {
  return (
    <div class="empty-state">
      <Icon name={p.icon ?? 'info'} size={40} />
      <div class="empty-state-text">{p.children}</div>
      {p.action &&
        (p.action.href ? (
          <a class="btn btn-tonal" href={p.action.href}>
            <span>{p.action.label}</span>
          </a>
        ) : (
          <button
            type="button"
            class="btn btn-tonal"
            onClick={p.action.onClick}
          >
            <span>{p.action.label}</span>
          </button>
        ))}
    </div>
  );
}
