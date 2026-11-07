/**
 * The one owner of page-scroll locking (S13 A3): a modal sheet and the
 * search view each take a lock, and the page scrolls again when the last
 * one is released, whatever order they close in.
 */

/** A counted lock on `style.overflow`; each call returns its release. */
export function scrollLocker(style: { overflow: string }): () => () => void {
  let held = 0;
  let before = '';
  return () => {
    if (held === 0) {
      before = style.overflow;
      style.overflow = 'hidden';
    }
    held += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      held -= 1;
      if (held === 0) style.overflow = before;
    };
  };
}

let page: (() => () => void) | null = null;

/** Holds the page still; call the returned function to let it go. */
export function lockScroll(): () => void {
  page ??= scrollLocker(document.documentElement.style);
  return page();
}
