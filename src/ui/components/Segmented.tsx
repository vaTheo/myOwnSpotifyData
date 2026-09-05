import { useEffect, useRef, useState } from 'preact/hooks';

export function Segmented<T extends string>(p: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  scroll?: boolean;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [fadedLeft, setFadedLeft] = useState(false);
  const [fadedRight, setFadedRight] = useState(false);
  /**
   * A scrolling row can hold the selected chip off-screen: By year defaults to
   * the newest year, the rightmost chip, and `Open Aug 2026 ›` arrives with a
   * month picked too. Centre the selection on arrival and on every change by
   * adjusting the row's own `scrollLeft` — never `scrollIntoView`, which walks
   * every scrollable ancestor including the document and would fight
   * `history.scrollRestoration` on a back/forward return. Fade whichever edge
   * still has chips beyond it (both, one, or neither), so a row that fits, a
   * row scrolled to its start and a row scrolled to its end each keep a clean
   * edge on the side with nothing left to reveal. `options.length` is a
   * dependency because a revisit can re-render with the same `value` and a
   * different chip count. Rows without `scroll` — Top, Playlist, Settings and
   * the other Crate views — never move.
   */
  useEffect(() => {
    const box = row.current;
    if (!p.scroll || !box) return;
    const updateFade = () => {
      setFadedLeft(box.scrollLeft > 0);
      setFadedRight(box.scrollLeft + box.clientWidth < box.scrollWidth - 1);
    };
    const btn = box.querySelector<HTMLElement>('.active');
    if (btn) {
      const b = box.getBoundingClientRect();
      const r = btn.getBoundingClientRect();
      box.scrollLeft +=
        r.left - b.left - (box.clientWidth - btn.clientWidth) / 2;
    }
    updateFade();
    box.addEventListener('scroll', updateFade, { passive: true });
    window.addEventListener('resize', updateFade);
    return () => {
      box.removeEventListener('scroll', updateFade);
      window.removeEventListener('resize', updateFade);
    };
  }, [p.scroll, p.value, p.options.length]);
  const classes = [
    p.scroll ? 'segmented scroll' : 'segmented',
    p.scroll && fadedLeft ? 'faded-left' : '',
    p.scroll && fadedRight ? 'faded-right' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div ref={row} class={classes} role="tablist">
      {p.options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="tab"
          aria-selected={o.value === p.value}
          class={o.value === p.value ? 'active' : ''}
          onClick={() => p.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
