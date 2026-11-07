import { Icon, type IconName } from '../icons';

/**
 * Material 3 icon button (spec 003, FR-014): the label is required and is
 * both the accessible name and the tooltip. A link when `href` is given,
 * otherwise a button. The hit area is 48 × 48 whatever the icon's size.
 */
export function IconButton(p: {
  icon: IconName;
  label: string;
  href?: string | null;
  external?: boolean;
  onClick?: () => void;
  filled?: boolean;
  disabled?: boolean;
  class?: string;
}) {
  const classes = p.class ? `icon-btn ${p.class}` : 'icon-btn';
  const icon = <Icon name={p.icon} filled={p.filled} size={22} />;
  if (p.href) {
    return (
      <a
        class={classes}
        href={p.href}
        aria-label={p.label}
        title={p.label}
        {...(p.external ? { target: '_blank', rel: 'noopener' } : {})}
      >
        {icon}
      </a>
    );
  }
  return (
    <button
      type="button"
      class={classes}
      aria-label={p.label}
      title={p.label}
      disabled={p.disabled}
      onClick={p.onClick}
    >
      {icon}
    </button>
  );
}
