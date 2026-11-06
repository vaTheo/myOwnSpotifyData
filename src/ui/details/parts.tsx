import type { ComponentChild } from 'preact';
import { MONTH_NAMES } from '../../model/crate';
import { model } from '../../model/state';
import { routeHref } from '../../router';
import { plural } from '../format';

/**
 * Pieces the details sheet shares with the Crate views. They live here, not
 * in `crate/shared`, which opens the sheet: the details depend on nothing
 * of the Crate's, so the two never import each other.
 */

/** '2026-08' -> 'Aug 2026'. */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

/**
 * A dense year/month readout. Each `<label> <count>` pair is one nowrap span
 * carrying its own trailing separator, so a line can break only after a " · "
 * and a count never opens a line.
 */
export function Strip(p: { cells: string[] }) {
  const nodes: ComponentChild[] = [];
  p.cells.forEach((cell, i) => {
    const last = i === p.cells.length - 1;
    nodes.push(<span key={`${i} ${cell}`}>{last ? cell : `${cell} ·`}</span>);
    if (!last) nodes.push(' ');
  });
  return <p class="strip">{nodes}</p>;
}

/**
 * The one sentence the details sheet shows when the track sits in none of
 * the synced playlists, so the wording exists once.
 */
export function NoPlaylistNote() {
  const m = model.value;
  if (!m) return null;
  return (
    <p>
      {m.playlists.length === 0
        ? 'Sync your playlists in Settings to see where this sits'
        : `Not in any of your ${plural(m.playlists.length, 'playlist')}`}
    </p>
  );
}

export function OpenMonthLink(p: { month: string }) {
  return (
    <p>
      <a href={routeHref({ name: 'crateView', view: 'year', period: p.month })}>
        Open {monthLabel(p.month)} ›
      </a>
    </p>
  );
}
