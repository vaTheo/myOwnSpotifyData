import { useEffect, useRef, useState } from 'preact/hooks';

export function Segmented<T extends string>(p: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  scroll?: boolean;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [faded, setFaded] = useState(false);
  /**
   * A scrolling row can hold the selected chip off-screen: By year defaults to
   * the newest year, the rightmost chip, and `Open Aug 2026 ›` arrives with a
   * month picked too. Centre the selection on arrival and on every change, and
   * fade the right edge while chips remain to the right of it — so a row that
   * fits, and a row scrolled to its end, keep a clean edge. `options.length`
   * is a dependency because a revisit can re-render with the same `value` and
   * a different chip count. Rows without `scroll` — Top, Playlist, Settings
   * and the other Crate views — never move.
   */
  useEffect(() => {
    const box = row.current;
    if (!p.scroll || !box) return;
    const update = () => {
      setFaded(box.scrollWidth - box.clientWidth - box.scrollLeft > 1);
    };
    box
      .querySelector('.active')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' });
    update();
    box.addEventListener('scroll', update, { passive: true });
    return () => box.removeEventListener('scroll', update);
  }, [p.scroll, p.value, p.options.length]);
  const scrollClass = faded ? 'segmented scroll faded' : 'segmented scroll';
  return (
    <div ref={row} class={p.scroll ? scrollClass : 'segmented'} role="tablist">
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
