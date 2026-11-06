/**
 * Focuses the first rendered element matching `selector`, waiting a few
 * frames for it: after closing a sheet or a pane, the hash change and the
 * render that brings the row back land a frame or two later.
 */
export function focusWhenReady(
  selector: string,
  preventScroll: boolean,
  frames = 10
): void {
  requestAnimationFrame(() => {
    const el = [...document.querySelectorAll<HTMLElement>(selector)].find(
      (e) => e.offsetParent !== null
    );
    if (el) {
      el.focus({ preventScroll });
      return;
    }
    if (frames > 1) focusWhenReady(selector, preventScroll, frames - 1);
  });
}
