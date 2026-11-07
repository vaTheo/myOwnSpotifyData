import { useEffect, useRef, useState } from 'preact/hooks';
import { IconButton } from '../components/IconButton';
import type { IconName } from '../icons';

export interface RowMenuItem {
  label: string;
  /** A link item (opens in a new tab) instead of an action. */
  href?: string;
  onSelect?: () => void;
  /** A sub-menu: the list shows these items (and Back) in its place. */
  items?: RowMenuItem[];
}

/** Where the open list sits: under the button, or above it. */
interface Place {
  /** The button's bottom when it opened: a scroll that moves it closes. */
  anchor: number;
  top?: number;
  bottom?: number;
  right: number;
  maxHeight: number;
}

/** A menu item's height and the list's padding (styles.css). */
const ITEM_PX = 48;
const LIST_PAD_PX = 8;

/**
 * Under the button when the list fits above the bottom bar (the phone's
 * navigation) or the window's edge; else above it when there is more room
 * there; it scrolls when neither side holds it whole. The list never
 * covers the top bar or the navigation.
 */
function place(r: DOMRect, items: number): Place {
  const right = Math.max(8, innerWidth - r.right);
  const nav = document.querySelector('.nav')?.getBoundingClientRect();
  const floor = nav && nav.top > r.bottom ? nav.top : innerHeight;
  const bar = document.querySelector('.top-bar')?.getBoundingClientRect();
  const ceiling = bar && bar.bottom < r.top ? bar.bottom : 0;
  const need = items * ITEM_PX + LIST_PAD_PX;
  const below = floor - r.bottom - 8;
  const above = r.top - ceiling - 8;
  if (need <= below || below >= above) {
    return { anchor: r.bottom, top: r.bottom, right, maxHeight: below };
  }
  return {
    anchor: r.bottom,
    bottom: innerHeight - r.top,
    right,
    maxHeight: above,
  };
}

/**
 * A row's "More" menu: one 48 px `more_vert` button, its items in a list
 * fixed to the viewport, so a table cell's clipping never hides it. Closes
 * on Escape (focus back on the button), a tap outside, a scroll that moves
 * the row, and when the focus leaves it. Up and Down move between the
 * items (wrapping), Home and End to the first and the last. An item with
 * `items` opens them in the same list, after a Back item (the phone's
 * "Listen…", fix round 1 R3).
 */
export function RowMenu(p: {
  label: string;
  items: RowMenuItem[];
  /** The button's icon: `more_vert` unless given (Listen: `headphones`). */
  icon?: IconName;
}) {
  const [at, setAtState] = useState<Place | null>(null);
  const [sub, setSub] = useState<RowMenuItem[] | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // While the list swaps to or from a sub-menu, the focused item leaves the
  // page: that focus loss must not close the menu.
  const switching = useRef(false);
  const open = at !== null;
  const setAt = (next: Place | null): void => {
    if (next === null) setSub(null);
    setAtState(next);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setAt(null);
    const top = at.anchor;
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
    return () => {
      document.removeEventListener('pointerdown', onDown);
      removeEventListener('scroll', onScroll, true);
      removeEventListener('resize', close);
    };
  }, [open]);

  // The first item takes the focus when the list or the sub-menu opens.
  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    switching.current = false;
  }, [open, sub]);

  /** Shows a sub-menu in the list, placed again for its length. */
  function openSub(items: RowMenuItem[]): void {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    switching.current = true;
    setSub(items);
    setAtState(place(r, items.length + 1));
  }

  function toggle(): void {
    if (open) {
      setAt(null);
      return;
    }
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setAt(place(r, p.items.length));
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
        if (switching.current) return;
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
          style={{
            ...(at.top !== undefined ? { top: `${at.top}px` } : {}),
            ...(at.bottom !== undefined ? { bottom: `${at.bottom}px` } : {}),
            right: `${at.right}px`,
            maxHeight: `${at.maxHeight}px`,
          }}
        >
          {sub !== null && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const r = box.current?.getBoundingClientRect();
                switching.current = true;
                setSub(null);
                if (r) setAtState(place(r, p.items.length));
              }}
            >
              ‹ Back
            </button>
          )}
          {(sub ?? p.items).map((item) =>
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
                aria-haspopup={item.items ? 'menu' : undefined}
                onClick={() => {
                  if (item.items) {
                    openSub(item.items);
                    return;
                  }
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
