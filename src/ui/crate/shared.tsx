import type { ComponentChildren } from 'preact';
import type { PlayRow } from '../../db/schema';
import type { Model } from '../../model/aggregate';
import { hasMonthData } from '../../model/crate';
import { nameKey } from '../../model/normalize';
import { model } from '../../model/state';
import { routeHref } from '../../router';
import { TrackRow } from '../components/TrackRow';
import { artistNames, plural } from '../format';

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Spec §3: an export whose last play is older than this reads as stale. The
 * hub's provenance line and Heavy rotation's empty state both need it.
 */
export const STALE_MS = 35 * 24 * 60 * 60 * 1000;

/** A play row from an import that recorded month buckets. */
export type CrateRowData = PlayRow & { months: Record<string, number> };

/** Every Crate view works on these rows; older rows are simply absent. */
export function useCrateRows(): CrateRowData[] {
  const m = model.value;
  return m ? m.plays.filter(hasMonthData) : [];
}

/** '2026-08' -> 'Aug 2026'. */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

/**
 * The synced track wins: the export holds whatever names Spotify wrote at
 * play time, and either of them can be null.
 */
export function trackLabel(row: PlayRow): {
  title: string;
  subtitle: string;
} {
  const track = model.value?.tracksByKey.get(row.trackId);
  if (track) return { title: track.name, subtitle: artistNames(track.artists) };
  return {
    title: row.trackName ?? 'Unknown title',
    subtitle: row.artistName ?? 'Unknown artist',
  };
}

export function trackUrl(row: PlayRow): string {
  return `https://open.spotify.com/track/${row.trackId}`;
}

/** By id first, then by artist and title, so a relinked id still matches. */
export function playlistsOfRow(m: Model, row: PlayRow): string[] {
  const byId = m.playlistsOfTrack.get(row.trackId);
  if (byId && byId.size > 0) return [...byId];
  if (!row.artistName || !row.trackName) return [];
  const byName = m.playlistsOfNameKey.get(
    nameKey(row.artistName, row.trackName)
  );
  return byName ? [...byName] : [];
}

/** The amber badge stays silent until a playlist has actually been synced. */
export function inNoPlaylist(row: PlayRow): boolean {
  const m = model.value;
  return !!m && m.playlists.length > 0 && playlistsOfRow(m, row).length === 0;
}

/**
 * Badge 2 is passed in already decided: the amber rule competes with `New`
 * on Heavy rotation, so the precedence belongs to each screen, not here.
 */
export function CrateRow(p: {
  rank: number;
  row: PlayRow;
  badge1: ComponentChildren;
  badge2?: ComponentChildren;
  expanded: boolean;
  onToggle: () => void;
  children?: ComponentChildren;
}) {
  const label = trackLabel(p.row);
  return (
    <TrackRow
      rank={p.rank}
      title={label.title}
      subtitle={label.subtitle}
      spotifyUrl={trackUrl(p.row)}
      onClick={p.onToggle}
      badges={
        <>
          {p.badge1}
          {p.badge2}
        </>
      }
    >
      {p.expanded && <div class="sublist">{p.children}</div>}
    </TrackRow>
  );
}

export function PlaylistLinks(p: { row: PlayRow }) {
  const m = model.value;
  if (!m) return null;
  const ids = playlistsOfRow(m, p.row);
  if (ids.length === 0) {
    return (
      <p>
        {m.playlists.length === 0
          ? 'Sync your playlists in Settings to see where this sits'
          : `Not in any of your ${plural(m.playlists.length, 'playlist')}`}
      </p>
    );
  }
  return (
    <>
      <p>In {plural(ids.length, 'playlist')}</p>
      <ul>
        {ids.map((id) => (
          <li key={id}>
            <a href={routeHref({ name: 'playlist', id })}>
              {m.playlistsById.get(id)?.name ?? id}
            </a>
          </li>
        ))}
      </ul>
    </>
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

/** The `‹ Crate` link and the title of spec §3, before any data check. */
export function CrateShell(p: { title: string; children?: ComponentChildren }) {
  return (
    <section>
      <a class="back" href={routeHref({ name: 'crate' })}>
        ‹ Crate
      </a>
      <h1>{p.title}</h1>
      {p.children}
    </section>
  );
}

/** List footer: spec §3 renders PAGE_SIZE rows, then grows on demand. */
export function Paged(p: {
  shown: number;
  total: number;
  step: number;
  onMore: () => void;
}) {
  if (p.total <= p.shown) return null;
  return (
    <>
      <p class="footer-note">
        Showing the top {p.shown.toLocaleString()} of {p.total.toLocaleString()}
      </p>
      <div class="actions">
        <button type="button" onClick={p.onMore}>
          Show {p.step.toLocaleString()} more
        </button>
      </div>
    </>
  );
}
