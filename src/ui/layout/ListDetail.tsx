import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { TrackRow } from '../components/TrackRow';
import { moveIndex } from '../table/keyboard';
import { ESCAPE_RANK, pushEscapeLayer } from './escape';
import { focusWhenReady } from './focus';
import { windowClass, type WindowClass } from './windowClass';

/**
 * Where the list goes (contracts/components.md, research D6): beside the
 * detail on expanded and large windows, away on compact and medium ones,
 * where the detail is a full screen with the top bar's back arrow. Without
 * a selection the list has the whole width.
 */
export function listDetailLayout(
  size: WindowClass,
  selected: boolean
): 'list' | 'split' | 'detail' {
  if (!selected) return 'list';
  return size === 'expanded' || size === 'large' ? 'split' : 'detail';
}

/**
 * Material's list–detail layout (spec 003, FR-020, US3): Playlists and
 * Artists with one item open. `list(narrow)` draws the full-width table, or
 * the 360 px `ListPane` beside a detail. On large windows the pane folds
 * away while a docked details sheet is open (CSS, `:has`), so the detail
 * keeps its width. The two slots keep their places in every layout, so a
 * resize never remounts the detail and its open sheet stays open (US3,
 * scenario 4). Escape closes a detail shown beside the list and gives the
 * focus back to its row (`data-row-id={selectedId}`) in the list.
 */
export function ListDetail(p: {
  list: (narrow: boolean) => ComponentChildren;
  detail: ComponentChildren | null;
  selectedId: string | null;
  /** Leaves the detail: the address of the list alone. */
  onClose: () => void;
}) {
  const layout = listDetailLayout(windowClass.value, p.detail !== null);
  const split = layout === 'split';
  const selectedId = useRef(p.selectedId);
  selectedId.current = p.selectedId;
  const onClose = useRef(p.onClose);
  onClose.current = p.onClose;

  useEffect(() => {
    if (!split) return;
    return pushEscapeLayer(() => {
      const id = selectedId.current;
      onClose.current();
      if (id !== null) {
        // The full-width list's row, not the pane's item still on screen
        // until the address change renders.
        focusWhenReady(
          `.list-detail-full [data-row-id="${CSS.escape(id)}"]`,
          false
        );
      }
    }, ESCAPE_RANK.pane);
  }, [split]);

  // Opening an item from the full-width list unmounts the row that had the
  // focus: the pane's open item takes it, so the keyboard keeps its place
  // (FR-043). Only on that change: a page loaded on a detail, or focus
  // elsewhere (a link in the detail, the top bar), is left alone.
  const before = useRef(layout);
  useEffect(() => {
    const from = before.current;
    before.current = layout;
    if (layout !== 'split' || from !== 'list') return;
    requestAnimationFrame(() => {
      const at = document.activeElement;
      if (at && at !== document.body) return;
      focusWhenReady('.list-detail-pane [aria-current="page"]', true);
    });
  }, [layout]);

  return (
    <div class={`list-detail ${layout}`}>
      {layout !== 'detail' && (
        <div class={split ? 'list-detail-pane' : 'list-detail-full'}>
          {p.list(split)}
        </div>
      )}
      {p.detail !== null && <div class="list-detail-detail">{p.detail}</div>}
    </div>
  );
}

export interface PaneItem {
  id: string;
  title: string;
  /** The one figure: "128 tracks". */
  subtitle: string;
  imageUrl?: string | null;
  href: string;
}

/**
 * The narrowed list beside a detail (contracts/components.md `ListPane`):
 * cover, name, one figure, the open item selected. Up and Down move between
 * the items, Enter opens one (FR-043). On mount the open item is scrolled
 * into the pane's view.
 */
export function ListPane(p: {
  label: string;
  items: PaneItem[];
  selectedId: string | null;
  head?: ComponentChildren;
  /** Shown instead of the items when none is left (a filter). */
  empty?: ComponentChildren;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pane = box.current;
    const item = pane?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!pane || !item) return;
    const a = pane.getBoundingClientRect();
    const b = item.getBoundingClientRect();
    if (b.top < a.top || b.bottom > a.bottom) {
      pane.scrollTop += b.top - a.top - a.height / 2 + b.height / 2;
    }
  }, []);

  function onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    const links = [
      ...(box.current?.querySelectorAll<HTMLElement>('a.main') ?? []),
    ];
    const at = links.indexOf(target);
    if (at < 0) return;
    const next = moveIndex(at, e.key, links.length, 10);
    if (next === null) return;
    e.preventDefault();
    links[next].focus();
  }

  return (
    <div class="list-pane" ref={box}>
      {p.head && <div class="list-pane-head">{p.head}</div>}
      {p.items.length === 0 && p.empty ? (
        p.empty
      ) : (
        <ul class="list" aria-label={p.label} onKeyDown={onKeyDown}>
          {p.items.map((item) => (
            <TrackRow
              key={item.id}
              imageUrl={item.imageUrl}
              title={item.title}
              subtitle={item.subtitle}
              href={item.href}
              rowId={item.id}
              selected={item.id === p.selectedId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
