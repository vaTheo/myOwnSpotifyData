import { useEffect, useRef, useState } from 'preact/hooks';
import { IconButton } from '../components/IconButton';
import type { IconName } from '../icons';

export interface RowMenuItem {
  label: string;
  /** A link item (opens in a new tab) instead of an action. */
  href?: string;
  onSelect?: () => void;
}

/**
 * A row's "More" menu: one 48 px `more_vert` button, its items in a list
 * fixed to the viewport, so a table cell's clipping never hides it. Closes
 * on Escape (focus back on the button), a tap outside, a scroll that moves
 * the row, and when the focus leaves it. Up and Down move between the
 * items (wrapping), Home and End to the first and the last.
 */
export function RowMenu(p: {
  label: string;
  items: RowMenuItem[];
  /** The button's icon: `more_vert` unless given (Listen: `headphones`). */
  icon?: IconName;
}) {
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const open = at !== null;

  useEffect(() => {
    if (!open) return;
    const close = () => setAt(null);
    const top = at.top;
    // A scroll that moves the row away closes the menu; one that leaves it
    // in place (a focus, a test runner's scroll-into-view) does not.
    const onScroll = () => {
      const r = box.current?.getBoundingClientRect();
      if (!r || Math.abs(r.bottom - top) > 4) close();
    };
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onDown);
    addEventListener('scroll', onScroll, true);
    addEventListener('resize', close);
    box.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      removeEventListener('scroll', onScroll, true);
      removeEventListener('resize', close);
    };
  }, [open]);

  function toggle(): void {
    if (open) {
      setAt(null);
      return;
    }
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setAt({ top: r.bottom, right: Math.max(8, innerWidth - r.right) });
  }

  return (
    <div
      class="row-menu"
      ref={box}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setAt(null);
          box.current?.querySelector<HTMLElement>('.icon-btn')?.focus();
          return;
        }
        // The menu pattern: arrows move between the items, wrapping; Home
        // and End go to the first and the last.
        if (!open) return;
        const items = [
          ...(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
            []),
        ];
        if (items.length === 0) return;
        const index = items.indexOf(document.activeElement as HTMLElement);
        const last = items.length - 1;
        const next =
          e.key === 'ArrowDown'
            ? index < 0 || index === last
              ? 0
              : index + 1
            : e.key === 'ArrowUp'
              ? index <= 0
                ? last
                : index - 1
              : e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? last
                  : null;
        if (next === null) return;
        e.preventDefault();
        items[next].focus();
      }}
      onFocusOut={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node | null)) {
          setAt(null);
        }
      }}
    >
      <IconButton
        icon={p.icon ?? 'more_vert'}
        label={p.label}
        onClick={toggle}
      />
      {at !== null && (
        <div
          class="row-menu-list"
          role="menu"
          style={{ top: `${at.top}px`, right: `${at.right}px` }}
        >
          {p.items.map((item) =>
            item.href ? (
              <a
                key={item.label}
                role="menuitem"
                href={item.href}
                target="_blank"
                rel="noopener"
                onClick={() => setAt(null)}
              >
                {item.label}
              </a>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setAt(null);
                  item.onSelect?.();
                }}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
