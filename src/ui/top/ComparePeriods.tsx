import { signal } from '@preact/signals';
import { useRef, useState } from 'preact/hooks';
import type { Period } from '../../db/schema';
import { topArtists, topTracks } from '../../model/aggregate';
import { model } from '../../model/state';
import { routeHref } from '../../router';
import { TOP_PERIOD_LABEL, artistNames } from '../format';
import { moveIndex } from '../table/keyboard';

const PERIODS: Period[] = ['short_term', 'medium_term', 'long_term'];

/** The id under the pointer, and the id with the focus. */
const pointed = signal<string | null>(null);
const focused = signal<string | null>(null);

interface Item {
  id: string;
  rank: number;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  href?: string;
}

function itemsOf(kind: 'tracks' | 'artists', period: Period): Item[] {
  const m = model.value;
  if (!m) return [];
  if (kind === 'tracks') {
    return topTracks(m, period).map(({ item }) => ({
      id: item.id,
      rank: item.rank,
      title: item.name,
      subtitle: artistNames(item.artists),
      imageUrl: item.imageUrl,
    }));
  }
  return topArtists(m, period).map(({ item }) => ({
    id: item.id,
    rank: item.rank,
    title: item.name,
    subtitle: '',
    imageUrl: item.imageUrl,
    href: routeHref({ name: 'artist', key: item.id }),
  }));
}

/**
 * Compare periods (spec 003, FR-029; screens.md §4): the three periods side
 * by side as narrow ranked columns. Hovering or focusing an item outlines the
 * same id in the other columns, so a track that climbed or fell is found at
 * a glance. Large windows only; the caller decides.
 *
 * The whole comparison is one tab stop (roving tabindex): the up and down
 * arrows, PageUp, PageDown, Home and End move in a column, left and right
 * move to the same id in the next column, or to the same place when it is
 * not there. Moving the pointer away never clears the focused id.
 */
export function ComparePeriods(p: { kind: 'tracks' | 'artists' }) {
  const columns = PERIODS.map((period) => itemsOf(p.kind, period));
  const [active, setActive] = useState({ col: 0, index: 0 });
  const root = useRef<HTMLDivElement>(null);
  const outlined = pointed.value ?? focused.value;

  // The tab stop stays on an item that exists.
  const col = Math.min(active.col, PERIODS.length - 1);
  const index = Math.min(active.index, columns[col].length - 1);

  function focusItem(c: number, i: number): void {
    setActive({ col: c, index: i });
    root.current
      ?.querySelector<HTMLElement>(`[data-col="${c}"][data-index="${i}"]`)
      ?.focus();
  }

  function onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (!target.matches('[data-col]')) return;
    const c = Number(target.dataset.col);
    const i = Number(target.dataset.index);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const next = c + (e.key === 'ArrowLeft' ? -1 : 1);
      if (next < 0 || next >= columns.length || columns[next].length === 0)
        return;
      e.preventDefault();
      const same = columns[next].findIndex(
        (item) => item.id === columns[c][i].id
      );
      focusItem(next, same >= 0 ? same : Math.min(i, columns[next].length - 1));
      return;
    }
    const next = moveIndex(i, e.key, columns[c].length, 10);
    if (next === null) return;
    e.preventDefault();
    focusItem(c, next);
  }

  return (
    <div class="compare" ref={root} onKeyDown={onKeyDown}>
      {PERIODS.map((period, c) => (
        <section key={period} class="compare-col">
          <h2>{TOP_PERIOD_LABEL[period]}</h2>
          <ol class="compare-list" aria-label={TOP_PERIOD_LABEL[period]}>
            {columns[c].map((item, i) => {
              const body = (
                <>
                  <span class="compare-rank">{item.rank}</span>
                  <span class="compare-text">
                    <span class="dt-text">{item.title}</span>
                    {item.subtitle && (
                      <span class="dt-text">{item.subtitle}</span>
                    )}
                  </span>
                </>
              );
              const common = {
                class:
                  outlined === item.id ? 'compare-item same' : 'compare-item',
                'data-item-id': item.id,
                'data-col': c,
                'data-index': i,
                tabIndex: c === col && i === index ? 0 : -1,
                title: item.subtitle
                  ? `${item.title}, ${item.subtitle}`
                  : item.title,
                onMouseEnter: () => {
                  pointed.value = item.id;
                },
                onMouseLeave: () => {
                  pointed.value = null;
                },
                onFocus: () => {
                  setActive({ col: c, index: i });
                  focused.value = item.id;
                },
                onBlur: () => {
                  focused.value = null;
                },
              };
              return (
                <li key={item.id}>
                  {item.href ? (
                    <a {...common} href={item.href}>
                      {body}
                    </a>
                  ) : (
                    <div {...common}>{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
