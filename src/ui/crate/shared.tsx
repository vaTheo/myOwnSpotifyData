import type { Signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import type { PlayRow } from '../../db/schema';
import type { Model } from '../../model/aggregate';
import { hasMonthData } from '../../model/crate';
import { featureFor } from '../../model/features';
import { nameKey } from '../../model/normalize';
import { historySummary, model } from '../../model/state';
import { MonthBars } from '../charts/MonthBars';
import { seriesLabel, yearSpan, type MonthPoint } from '../charts/series';
import { openDetail } from '../details/navigate';
import { TrackSheet } from '../details/TrackDetails';
import { playLabel } from './labels';
import {
  bpmColumn,
  keyColumn,
  rankColumn,
  titleColumn,
} from '../table/columns';
import { DataTable, type Column } from '../table/DataTable';
import type { SortState } from '../table/sort';
import { trackFilterView } from '../filters/FilterBar';
import type { TrackFilter } from '../filters/trackFilter';
import { lastCall } from '../table/lastCall';

// The details' shared pieces, re-exported for the Crate views.
export { NoPlaylistNote, OpenMonthLink, monthLabel } from '../details/parts';

/** A play row from an import that recorded month buckets. */
export type CrateRowData = PlayRow & { months: Record<string, number> };

/** Every Crate view's item carries its play row. */
export interface CrateItem {
  row: PlayRow;
}

/** Each view keeps its sort per visit to the app, like its setting. */
export const DEFAULT_SORT: SortState = { columnId: null, direction: 'asc' };

/** Every Crate view works on these rows; older rows are simply absent. */
const crateRowsOf = lastCall((plays: PlayRow[]) => plays.filter(hasMonthData));
const NO_ROWS: CrateRowData[] = [];

/** The plays with month data; the same array while the model stays, so the
 *  views' memos hold (S13 A5). */
export function useCrateRows(): CrateRowData[] {
  const m = model.value;
  return m ? crateRowsOf(m.plays) : NO_ROWS;
}

/** The import's range, for the charts' gaps (null: every month inside). */
export function historyRange() {
  return historySummary.value?.range ?? null;
}

/**
 * Every year the export covers, gaps included: Classics prints a dash for a
 * year without plays, so the span comes from the import range and not from the
 * years that happen to have rows. Both `of N years` phrases count from it.
 */
export function spanYears(rows: PlayRow[]): number[] {
  return yearSpan(rows, historyRange(), new Date().getFullYear());
}

/** `playLabel` on the current model. */
export function trackLabel(row: PlayRow): {
  title: string;
  subtitle: string;
} {
  return playLabel(model.value, row);
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

/** The amber flag stays silent until a playlist has actually been synced. */
export function inNoPlaylist(row: PlayRow): boolean {
  const m = model.value;
  return !!m && m.playlists.length > 0 && playlistsOfRow(m, row).length === 0;
}

/**
 * A row's small bars (24 px, no tab stop). The bars are hidden from
 * assistive technology, so the cell carries the series as text: the row
 * reads its values (FR-026). A short series keeps narrow bars instead of
 * stretching one bar across the column.
 */
export function chartColumn<Item extends CrateItem>(
  header: string,
  title: string,
  seriesOf: (item: Item) => MonthPoint[],
  /** How many bars the series has: the column is sized from it. */
  points: number
): Column<Item> {
  return {
    id: 'chart',
    header,
    priority: 3,
    width: `${Math.min(192, Math.max(112, points * 12)) + 16}px`,
    cell: (item) => {
      const series = seriesOf(item);
      return (
        <span class="dt-chart" style={{ maxWidth: `${series.length * 20}px` }}>
          <MonthBars compact series={series} title={title} />
          <span class="visually-hidden">{seriesLabel(title, series)}</span>
        </span>
      );
    },
    compact: 'hidden',
  };
}

/**
 * The columns every Crate view shares (spec 003, screens.md §6): #, Title,
 * Artist, then the view's own figures and chart, its flag, BPM and Key. The
 * flag's precedence belongs to each view (Heavy rotation's `New` beats
 * "not in a playlist"), so it is passed in already decided; `null` leaves
 * the cell empty.
 */
export function crateColumns<Item extends CrateItem>(spec: {
  metrics: Column<Item>[];
  chart?: Column<Item>;
  flag: (item: Item) => ComponentChildren | null;
}): Column<Item>[] {
  const m = model.value;
  const featureOf = (item: Item) =>
    m ? featureFor(m, item.row.trackId) : null;
  return [
    rankColumn({ compact: 'lead' }),
    titleColumn((item) => trackLabel(item.row).title),
    titleColumn(
      (item) => trackLabel(item.row).subtitle,
      { header: 'Artist' },
      {
        id: 'artist',
        priority: 2,
        width: 'minmax(0, 1.5fr)',
        compact: 'subtitle',
      }
    ),
    ...spec.metrics,
    ...(spec.chart ? [spec.chart] : []),
    {
      id: 'flag',
      header: 'Flag',
      headerHidden: true,
      priority: 2,
      width: '168px',
      cell: (item) => spec.flag(item),
      compact: 'meta',
    },
    bpmColumn(featureOf),
    keyColumn(featureOf),
  ];
}

/**
 * A Crate view's table: ranked as the view ranks, 100 rows a page with the
 * footer's count, a row opening the track's details (`?d=`).
 */
export function CrateTable<Item extends CrateItem>(p: {
  label: string;
  items: Item[];
  columns: Column<Item>[];
  sort: Signal<SortState>;
  /** The view's own filters (FR-052), one signal per view. */
  filter: Signal<TrackFilter>;
  /** The view's setting: a change goes back to the first page. */
  resetKey: string;
  detail: string | undefined;
}) {
  const m = model.value;
  const filtered = trackFilterView({
    filter: p.filter,
    rows: p.items,
    featureOf: (item) => (m ? featureFor(m, item.row.trackId) : null),
    textOf: (item) => {
      const label = trackLabel(item.row);
      return `${label.title} ${label.subtitle}`;
    },
  });
  return (
    <>
      {filtered.bar}
      {filtered.empty ?? (
        <DataTable
          label={p.label}
          noun="track"
          columns={p.columns}
          rows={p.items}
          only={filtered.only}
          rowKey={(item) => item.row.trackId}
          sort={p.sort.value}
          onSort={(s) => {
            p.sort.value = s;
          }}
          resetKey={p.resetKey}
          selectedKey={p.detail ?? null}
          follow={p.detail !== undefined}
          onOpen={(item) => openDetail(item.row.trackId)}
        />
      )}
    </>
  );
}

/**
 * The details sheet of a Crate view (spec 003, US3): the track's facts, and
 * `extra`, the view's own figures and chart for it (on a phone the chart
 * lives only here).
 */
export function CrateSheet(p: {
  detail: string | undefined;
  extra?: ComponentChildren;
}) {
  if (!p.detail) return null;
  // A track the history never played (opened from search) has no play row:
  // its sheet is the track's own.
  const row = model.value?.playsById.has(p.detail);
  return (
    <TrackSheet
      trackRef={row ? { playRowId: p.detail } : { trackId: p.detail }}
      rowId={p.detail}
      extra={p.extra}
    />
  );
}

/**
 * A Crate view's section. Its title and the way back to the hub are the top
 * bar's (spec 003, FR-004: the title and the up arrow come from
 * `layout/titles.ts`), drawn before any data check as before.
 */
export function CrateShell(p: { children?: ComponentChildren }) {
  return <section class="crate-view">{p.children}</section>;
}
