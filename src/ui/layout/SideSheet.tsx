import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { IconButton } from '../components/IconButton';
import { windowClass, type WindowClass } from './windowClass';

export type SheetMode = 'docked' | 'modal' | 'fullscreen';

/** Research D9: docked on large, modal on medium and expanded, full screen on compact. */
export function sheetMode(size: WindowClass): SheetMode {
  if (size === 'large') return 'docked';
  return size === 'compact' ? 'fullscreen' : 'modal';
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Focus goes back to the row the sheet was opened from, once it renders. */
function focusRow(rowId: string): void {
  requestAnimationFrame(() => {
    const row = document.querySelector<HTMLElement>(
      `[data-row-id="${CSS.escape(rowId)}"]`
    );
    row?.focus({ preventScroll: true });
  });
}

/**
 * Material's side sheet (spec 003, FR-019, research D9). Docked at 400 px on
 * large windows, where the content beside it shrinks and the list keeps the
 * keyboard; a modal sheet with a scrim and a focus trap on medium and
 * expanded windows; a full-screen dialog on compact ones. Escape and ✕ call
 * `onClose` (the screen drops `?d=`); when the sheet goes, focus returns to
 * the element marked `data-row-id={rowId}`.
 */
export function SideSheet(p: {
  title: string;
  rowId: string;
  onClose: () => void;
  children: ComponentChildren;
}) {
  const mode = sheetMode(windowClass.value);
  const modal = mode !== 'docked';
  const sheet = useRef<HTMLElement>(null);
  const rowId = useRef(p.rowId);
  rowId.current = p.rowId;
  const onClose = useRef(p.onClose);
  onClose.current = p.onClose;

  // Escape closes from anywhere: on a docked sheet focus stays in the list.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      onClose.current();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      focusRow(rowId.current);
    };
  }, []);

  // A modal sheet takes the focus and holds the page still under its scrim.
  useEffect(() => {
    if (!modal) return;
    sheet.current?.focus();
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = before;
    };
  }, [modal]);

  function trap(e: KeyboardEvent): void {
    if (!modal || e.key !== 'Tab' || !sheet.current) return;
    const items = [
      ...sheet.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    ].filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === sheet.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      {modal && (
        <div
          class="side-sheet-scrim"
          aria-hidden="true"
          onClick={() => p.onClose()}
        />
      )}
      <aside
        ref={sheet}
        class={`side-sheet ${mode}`}
        role={modal ? 'dialog' : 'complementary'}
        aria-modal={modal ? true : undefined}
        aria-labelledby="side-sheet-title"
        tabIndex={-1}
        onKeyDown={trap}
      >
        <div class="side-sheet-head">
          <h2 id="side-sheet-title" class="side-sheet-title" title={p.title}>
            {p.title}
          </h2>
          <IconButton icon="close" label="Close details" onClick={p.onClose} />
        </div>
        <div class="side-sheet-body">{p.children}</div>
      </aside>
    </>
  );
}
