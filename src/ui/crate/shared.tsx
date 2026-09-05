import type { ComponentChildren } from 'preact';
import type { PlayRow } from '../../db/schema';
import type { Model } from '../../model/aggregate';
import { MONTH_NAMES, hasMonthData, yearsWithPlays } from '../../model/crate';
import { nameKey } from '../../model/normalize';
import { historySummary, model } from '../../model/state';
import { routeHref } from '../../router';
import { FeaturePills } from '../components/FeaturePills';
import { TrackRow } from '../components/TrackRow';
import { artistNames, plural } from '../format';

/** A play row from an import that recorded month buckets. */
export type CrateRowData = PlayRow & { months: Record<string, number> };

/** Every Crate view works on these rows; older rows are simply absent. */
export function useCrateRows(): CrateRowData[] {
  const m = model.value;
  return m ? m.plays.filter(hasMonthData) : [];
}

function yearOf(iso: string | undefined): number | null {
  if (!iso) return null;
  const year = new Date(iso).getFullYear();
  return Number.isFinite(year) ? year : null;
}

/**
 * Every year the export covers, gaps included: Classics prints a dash for a
 * year without plays, so the span comes from the import range and not from the
 * years that happen to have rows. Both `of N years` phrases count from it.
 */
export function spanYears(rows: PlayRow[]): number[] {
  const range = historySummary.value?.range;
  const played = yearsWithPlays(rows);
  const first = yearOf(range?.first) ?? played[0] ?? new Date().getFullYear();
  const last = yearOf(range?.last) ?? played[played.length - 1] ?? first;
  const years: number[] = [];
  for (let y = first; y <= last; y += 1) years.push(y);
  return years.length > 0 ? years : [first];
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
 *
 * The feature pills are appended once, for all five views. Spec §5: the
 * "never a third badge" rule covers the sort and context badges only, and the
 * pills are a separate group after them. `FeaturePills` draws nothing until
 * a lookup or a Rekordbox import has given this track a value, so an
 * un-enriched Crate looks exactly as it does today.
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
          <FeaturePills trackId={p.row.trackId} />
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
