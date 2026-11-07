import { useEffect, useRef, useState } from 'preact/hooks';
import type { MixRowSource, TracklistRow } from '../../db/schema';
import { digLinks } from '../../features/mix/digLinks';
import {
  libraryTitleIndex,
  matchMixRow,
  type MixMatch,
} from '../../features/mix/match';
import { parseClock } from '../../features/mix/parse';
import {
  FILTER_CAPTION,
  reviewChips,
  spotifyStatus,
  type ReviewFilter,
} from '../../features/mix/review';
import { isIdentified } from '../../features/mix/spotifySearch';
import { decadeLabel } from '../../model/year';
import {
  addMixRow,
  deleteMixRow,
  editMixRow,
  mixCheckSaved,
  mixError,
  mixRows,
  model,
  saveMix,
  toggleValidated,
} from '../../model/state';
import { Button } from '../components/Button';
import { FeaturePills } from '../components/FeaturePills';
import { Flag } from '../components/Flag';
import { IconButton } from '../components/IconButton';
import { NoData } from '../components/NoData';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { StatusLine } from '../components/StatusLine';
import { TextField } from '../components/TextField';
import { formatClock, plural } from '../format';
import { Icon, type IconName } from '../icons';
import { windowClass } from '../layout/windowClass';
import { yearColumn } from '../table/columns';
import { DataTable, type Column } from '../table/DataTable';
import { nextSort, type SortState } from '../table/sort';
import { Clues } from './Clues';
import {
  SORT_FIRST,
  effectiveSort,
  sortChoices,
  sortValue,
  type SortId,
} from './tracklistSort';
import { tracklistView } from './tracklistView';
import { RowMenu, type RowMenuItem } from './RowMenu';
import {
  confidenceShort,
  confidenceText,
  gapCluesSummary,
  originText,
  referencesText,
  rowYear,
  sourceLabel,
  timeText,
  yearText,
} from './rowText';

/** One line of the table: the row, its place in `mixRows`, its library match. */
interface Line {
  row: TracklistRow;
  index: number;
  match: MixMatch | null;
}

/**
 * A sortable column's sort, from `tracklistSort` (spec 009): the value the
 * table sorts by and the direction of the first click.
 */
function sorts(id: SortId): {
  sortValue: (l: Line) => ReturnType<typeof sortValue>;
  firstDirection: 'asc' | 'desc';
} {
  return { sortValue: (l) => sortValue(id, l), firstDirection: SORT_FIRST[id] };
}

const SOURCE_ICON: Record<MixRowSource, IconName> = {
  trackid: 'search',
  description: 'info',
  pasted: 'queue_music',
  manual: 'edit',
  tracklistify: 'computer',
};

/** Spotify search, for a track the check has not found. */
function searchUrl(row: TracklistRow): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${row.artist} ${row.title}`)}`;
}

function nameOf(row: TracklistRow): string {
  return `${row.artist} – ${row.title}`;
}

function sourceTitle(row: TracklistRow): string {
  const origin = originText(row);
  const quote = row.origin === 'clue' && row.clue ? `“${row.clue.text}”` : '';
  return [sourceLabel(row), origin, quote].filter(Boolean).join(' · ');
}

/** "28 other mixes · in 2 playlists": the references, dropped at zero playlists. */
function referencesLine(l: Line): string | null {
  const parts = [
    referencesText(l.row),
    l.match && l.match.playlistCount > 0
      ? `in ${plural(l.match.playlistCount, 'playlist')}`
      : null,
  ].filter((s): s is string => s !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Where to listen to a track (T118): the dig links' plain search pages,
 * then Shazam's page while the row still reads as the scan heard it. No
 * request is made until one is opened.
 */
function listenItems(row: TracklistRow): RowMenuItem[] {
  if (!isIdentified(row)) return [];
  const items: RowMenuItem[] = digLinks(row.artist, row.title).map((l) => ({
    label: l.label,
    href: l.href,
  }));
  if (row.shazamUrl && row.source === 'tracklistify') {
    items.push({ label: 'Shazam', href: row.shazamUrl });
  }
  return items;
}

/**
 * Artist – Title, and under it what a round-003 row must show in words: the
 * **not heard** badge of a candidate (it starts To review, D6), the origin
 * ("second listen · +4 %", "from a comment by …"), the clue in quotes
 * (plain text, two lines at most), then the references.
 */
function TitleCell(p: { line: Line }) {
  const { row } = p.line;
  const origin = originText(row);
  const refs = referencesLine(p.line);
  const quote = row.origin === 'clue' && row.clue ? row.clue.text : null;
  const second = row.origin === 'clue' || origin !== null || refs !== null;
  return (
    <span class="mix-title-cell">
      <span class="dt-text mix-name">{nameOf(row)}</span>
      {second && (
        <span class="mix-second">
          {row.origin === 'clue' && <Flag kind="todo">not heard</Flag>}
          {origin !== null && <span class="mix-origin">{origin}</span>}
          {quote !== null && <span class="mix-quote">“{quote}”</span>}
          {refs !== null && <span class="mix-refs">{refs}</span>}
        </span>
      )}
    </span>
  );
}

/** Source: an icon named by its tooltip and its screen-reader text. */
function SourceCell(p: { row: TracklistRow }) {
  const label = sourceLabel(p.row);
  return (
    <span class="mix-source-icon" title={sourceTitle(p.row)}>
      <Icon name={SOURCE_ICON[p.row.source]} size={20} />
      <span class="visually-hidden">{label}</span>
    </span>
  );
}

/**
 * Confidence: "3× · 92 %" in the narrow column; the full "heard 3× · best
 * 92 %" for a screen reader, in the tooltip, and on a phone's meta line.
 */
function ConfidenceCell(p: { row: TracklistRow }) {
  const short = confidenceShort(p.row);
  const long = confidenceText(p.row);
  if (short === null || long === null) return null;
  return (
    <span class="mix-conf">
      <span class="mix-conf-short" aria-hidden="true">
        {short}
      </span>
      <span class="mix-conf-long visually-hidden">{long}</span>
    </span>
  );
}

const STATUS_TEXT = {
  unchecked: 'Not checked',
  found: 'On Spotify',
  notFound: 'Not found on Spotify',
} as const;

/**
 * Spotify (T117, T118): one 48 px icon — the track's link when the check
 * found it, else Not checked or Not found, each with its words for screen
 * readers and in the tooltip. On a phone, the words on the meta line (the
 * link is in the row's More menu).
 */
function SpotifyCell(p: { row: TracklistRow; compact: boolean }) {
  const { row } = p;
  if (!isIdentified(row)) return null;
  const status = spotifyStatus(row);
  if (p.compact) {
    return status === 'unchecked' ? null : (
      <span class={`mix-spotify-text ${status}`}>{STATUS_TEXT[status]}</span>
    );
  }
  if (typeof row.spotify === 'object') {
    return (
      <IconButton
        icon="open_in_new"
        class="mix-spotify found"
        label={`On Spotify: open ${nameOf(row)}`}
        href={row.spotify.url}
        external
      />
    );
  }
  return (
    <span class={`mix-spotify ${status}`} title={STATUS_TEXT[status]}>
      <Icon name={status === 'notFound' ? 'error' : 'schedule'} size={20} />
      <span class="visually-hidden">{STATUS_TEXT[status]}</span>
    </span>
  );
}

/**
 * Review (T118): ✓ toggles Validated and To review (pressed when
 * validated); ✕ removes the track (the same `deleteMixRow` as Delete), for
 * a track found wrongly. On a phone only ✓; Remove is in More.
 */
function ReviewCell(p: { line: Line; compact: boolean; onRemove: () => void }) {
  const { row, index } = p.line;
  const validated = row.validated === true;
  return (
    <span class="mix-review">
      <button
        type="button"
        class={validated ? 'icon-btn mix-validate on' : 'icon-btn mix-validate'}
        aria-pressed={validated}
        aria-label={`Validate ${nameOf(row)}`}
        title={validated ? 'Validated' : 'To review'}
        onClick={() => toggleValidated(index)}
      >
        <Icon name="check" size={22} />
      </button>
      {!p.compact && (
        <IconButton
          icon="close"
          label={`Remove ${nameOf(row)}`}
          onClick={p.onRemove}
        />
      )}
    </span>
  );
}

function columns(on: {
  edit: (index: number) => void;
  remove: (index: number) => void;
  compact: boolean;
  /** A row has clip counts: the Clips column is offered. */
  counted: boolean;
}): Column<Line>[] {
  const { compact } = on;
  const clips: Column<Line>[] = on.counted
    ? [
        {
          id: 'clips',
          header: 'Clips',
          align: 'end',
          priority: 3,
          width: '64px',
          ...sorts('clips'),
          cell: (l) =>
            l.row.hits === undefined ? <NoData /> : <span>{l.row.hits}×</span>,
          compact: 'hidden',
        },
      ]
    : [];
  return [
    {
      id: 'time',
      ...sorts('time'),
      header: 'Time',
      align: 'end',
      priority: 1,
      width: '72px',
      cell: (l) => {
        const t = timeText(l.row);
        return t === null ? <NoData /> : <span class="dt-rank">{t}</span>;
      },
      compact: 'lead',
    },
    {
      id: 'title',
      ...sorts('title'),
      header: 'Artist – Title',
      priority: 1,
      width: 'minmax(200px, 1fr)',
      cell: (l) => <TitleCell line={l} />,
      title: (l) => nameOf(l.row),
      compact: 'title',
    },
    {
      id: 'label',
      ...sorts('label'),
      header: 'Label',
      priority: 4,
      width: 'minmax(0, 0.4fr)',
      cell: (l) =>
        l.row.label ? <span class="dt-text">{l.row.label}</span> : null,
      title: (l) => l.row.label ?? undefined,
      compact: 'subtitle',
    },
    {
      id: 'source',
      ...sorts('source'),
      header: 'Source',
      priority: 3,
      width: '64px',
      cell: (l) => <SourceCell row={l.row} />,
      compact: 'meta',
    },
    {
      id: 'confidence',
      ...sorts('confidence'),
      header: 'Confidence',
      align: 'end',
      priority: 3,
      width: '112px',
      cell: (l) => <ConfidenceCell row={l.row} />,
      title: (l) => confidenceText(l.row) ?? undefined,
      compact: 'meta',
    },
    ...clips,
    {
      id: 'library',
      ...sorts('library'),
      header: 'In your library',
      priority: 2,
      width: '120px',
      cell: (l) =>
        l.match ? (
          <span class="mix-library">
            <FeaturePills trackId={l.match.trackId} />
          </span>
        ) : null,
      compact: 'meta',
    },
    // Round 005: the row's own year, its source in the tooltip.
    yearColumn((l: Line) => rowYear(l.row), {
      describe: (l, year) => yearText(l.row, year),
    }),
    {
      id: 'spotify',
      ...sorts('spotify'),
      header: 'Spotify',
      priority: 1,
      width: '64px',
      cell: (l) => <SpotifyCell row={l.row} compact={compact} />,
      compact: 'meta',
    },
    {
      id: 'listen',
      header: 'Listen',
      priority: 2,
      width: '48px',
      cell: (l) => {
        const items = listenItems(l.row);
        return items.length === 0 ? null : (
          <RowMenu
            icon="headphones"
            label={`Listen to ${nameOf(l.row)}`}
            items={items}
          />
        );
      },
      compact: 'hidden',
    },
    {
      id: 'review',
      ...sorts('review'),
      header: 'Review',
      priority: 1,
      width: compact ? '48px' : '96px',
      cell: (l) => (
        <ReviewCell
          line={l}
          compact={compact}
          onRemove={() => on.remove(l.index)}
        />
      ),
      compact: 'trail',
    },
    {
      id: 'more',
      header: 'More',
      headerHidden: true,
      align: 'end',
      priority: 1,
      width: '64px',
      cell: (l) => {
        const { row } = l;
        const items: RowMenuItem[] = [
          { label: 'Edit', onSelect: () => on.edit(l.index) },
          { label: 'Delete', onSelect: () => on.remove(l.index) },
        ];
        if (typeof row.spotify === 'object') {
          // On a phone the Spotify cell is words only: the link is here.
          if (compact)
            items.push({ label: 'Open on Spotify', href: row.spotify.url });
        } else if (isIdentified(row)) {
          items.push({ label: 'Search on Spotify', href: searchUrl(row) });
        }
        // On a phone one "Listen…" item opens the Listen links in the same
        // list, so More stays short (fix round 1, R3).
        const listen = compact ? listenItems(row) : [];
        if (listen.length > 0) items.push({ label: 'Listen…', items: listen });
        return <RowMenu label={`More for ${nameOf(row)}`} items={items} />;
      },
      compact: 'trail',
    },
  ];
}

/** A gap: "ID · unidentified", its span, its clues folded, and Delete. */
function GapLine(p: { row: TracklistRow; onDelete: () => void }) {
  const { row } = p;
  const span = timeText(row);
  return (
    <div class="mix-gap">
      <div class="mix-gap-text">
        <span class="mix-gap-title">ID · unidentified</span>
        {span !== null && <span class="mix-gap-span">{span}</span>}
        {row.clues && row.clues.length > 0 && (
          <Clues
            clues={row.clues}
            summary={gapCluesSummary(row.clues.length)}
          />
        )}
      </div>
      <IconButton icon="delete" label="Delete this gap" onClick={p.onDelete} />
    </div>
  );
}

/**
 * The row being edited: four text fields, Save and Cancel (`editMixRow`).
 * It takes the focus and scrolls into view when it opens, so Edit and Add
 * track land on the first field.
 */
function EditLine(p: {
  row: TracklistRow;
  onSave: (patch: {
    artist: string;
    title: string;
    label: string;
    startSec: number | null;
  }) => void;
  onCancel: () => void;
}) {
  const [artist, setArtist] = useState(p.row.artist);
  const [title, setTitle] = useState(p.row.title);
  const [label, setLabel] = useState(p.row.label ?? '');
  const [time, setTime] = useState(
    p.row.startSec !== null ? formatClock(p.row.startSec) : ''
  );
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const first = form.current?.querySelector<HTMLInputElement>('input');
    first?.focus({ preventScroll: true });
    form.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  return (
    <form
      class="mix-edit"
      ref={form}
      onSubmit={(e) => {
        e.preventDefault();
        p.onSave({
          artist,
          title,
          label,
          startSec: time.trim() === '' ? null : parseClock(time),
        });
      }}
    >
      <TextField placeholder="Artist" value={artist} onValue={setArtist} />
      <TextField placeholder="Title" value={title} onValue={setTitle} />
      <TextField
        placeholder="Label (optional)"
        value={label}
        onValue={setLabel}
      />
      <TextField
        placeholder="Time (m:ss, optional)"
        value={time}
        onValue={setTime}
      />
      <div class="mix-edit-actions">
        <Button variant="filled" type="submit">
          Save
        </Button>
        <Button variant="text" onClick={p.onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * The review's filter chips (T118, T127): All, To review, Validated, Not
 * on Spotify with their counts, and Heard once (N) when a row has clip
 * counts; one at a time. Round 004's Sort select beside them when a row
 * has clip counts (phones have no header sort). They hide rows, never
 * delete them.
 */
function RowView(p: {
  rows: readonly TracklistRow[];
  sort: SortState;
  onSort: (sort: SortState) => void;
  filter: ReviewFilter;
  onFilter: (filter: ReviewFilter) => void;
  counted: boolean;
  /** Round 005: the decades of the dated rows; none hides the year controls. */
  decades: readonly number[];
  decade: number | null;
  onDecade: (decade: number | null) => void;
}) {
  const dated = p.decades.length > 0;
  return (
    <div class="mix-rowview">
      <SegmentedButtons
        scroll
        options={reviewChips(p.rows).map((c) => ({
          value: c.filter,
          label: c.label,
        }))}
        value={p.filter}
        onChange={p.onFilter}
      />
      {p.rows.length > 0 && (
        <span class="mix-sort">
          <label>
            Sort{' '}
            <select
              id="mix-sort"
              value={p.sort.columnId ?? ''}
              onChange={(e) => {
                const id = (e.currentTarget as HTMLSelectElement).value;
                p.onSort(
                  id === ''
                    ? { columnId: null, direction: 'asc' }
                    : { columnId: id, direction: SORT_FIRST[id as SortId] }
                );
              }}
            >
              <option value="">Set order</option>
              {sortChoices(p.rows).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <IconButton
            icon={p.sort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
            label={
              p.sort.direction === 'asc'
                ? 'Ascending, tap for descending'
                : 'Descending, tap for ascending'
            }
            disabled={p.sort.columnId === null}
            onClick={() =>
              p.onSort(
                p.sort.columnId === null
                  ? p.sort
                  : nextSort(p.sort, p.sort.columnId, {})
              )
            }
          />
        </span>
      )}
      {dated && (
        <label>
          Decade{' '}
          <select
            id="mix-decade"
            value={p.decade === null ? '' : String(p.decade)}
            onChange={(e) => {
              const v = (e.currentTarget as HTMLSelectElement).value;
              p.onDecade(v === '' ? null : Number(v));
            }}
          >
            <option value="">All decades</option>
            {p.decades.map((d) => (
              <option key={d} value={String(d)}>
                {decadeLabel(d)}
              </option>
            ))}
          </select>
        </label>
      )}
      {(p.filter !== 'all' || p.decade !== null) && (
        <span class="mix-caption">{FILTER_CAPTION}</span>
      )}
    </div>
  );
}

/** The row key: the edited row remounts its fields, so Cancel drops the typing. */
function keyOf(index: number, editing: number | null): string {
  return `${index}${editing === index ? '-edit' : ''}`;
}

/**
 * The open mix's tracklist (spec 003 §12, T082, T118, T120, T127; S08 fix
 * 1 row layout) on `DataTable`. Rows keep their place in `mixRows`, so
 * Edit, Delete and Review act on the real row whatever the filter or the
 * Sort. Each row: Spotify status, Listen menu, ✓ / ✕, and More (Edit,
 * Delete, Search on Spotify). Library matches are computed here, at
 * render, never stored. Under the table: Add track and Save mix ("Saved ✓"
 * for 2 s). A save failure shows once: under Save mix, unless `mixError`
 * already shows the same words elsewhere on the screen.
 */
export function TracklistTable() {
  const rows = mixRows.value;
  const m = model.value;
  const index = m ? libraryTitleIndex(m) : null;
  const compact = windowClass.value === 'compact';
  const [editing, setEditing] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  // Check on Spotify saves the mix when it ends (ruling R1): the same
  // "Saved ✓" as Save mix says so.
  const checkSaves = mixCheckSaved.value;
  const firstSaves = useRef(checkSaves);
  useEffect(() => {
    if (checkSaves === firstSaves.current) return;
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [checkSaves]);
  // The save's own failure, kept apart from `mixError` (which other
  // actions also set) and cleared by the next action on the table.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sortChosen, setSortState] = useState<SortState>({
    columnId: null,
    direction: 'asc',
  });
  const [filter, setFilterState] = useState<ReviewFilter>('all');
  const [decade, setDecadeState] = useState<number | null>(null);
  const setDecade = (v: number | null): void => {
    setSaveError(null);
    setDecadeState(v);
  };
  const setSort = (v: SortState): void => {
    setSaveError(null);
    setSortState(v);
  };
  const setFilter = (v: ReviewFilter): void => {
    setSaveError(null);
    setFilterState(v);
  };
  const edit = (i: number | null): void => {
    setSaveError(null);
    setEditing(i);
  };
  // The Sort, the decade and the chip, with their fallbacks (round 005).
  const view = tracklistView(rows, { decade, filter }, editing);
  const { counted, decades, order } = view;
  // Spec 008: one sort for the headers and the select; a column the rows no
  // longer allow is the set's order.
  const sortNow = effectiveSort(sortChosen, rows);
  const decadeNow = view.decade;
  const lines: Line[] = order.map((i) => ({
    row: rows[i],
    index: i,
    match: m && index && !rows[i].gap ? matchMixRow(m, index, rows[i]) : null,
  }));
  const remove = (i: number): void => {
    deleteMixRow(i);
    edit(null);
  };

  const onSaveMix = (): void => {
    void (async () => {
      setSaveError(null);
      const ok = await saveMix();
      if (!ok) {
        // mixError says why; never "Saved ✓".
        setSaveError(mixError.peek());
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    })();
  };

  // `mixError` is always on screen (the Mixes list header, or the open
  // mix's header): the same words are not repeated here.
  const showSaveError = saveError !== null && saveError !== mixError.value;

  return (
    <div class="mix-tracklist">
      <RowView
        rows={rows}
        sort={sortNow}
        onSort={setSort}
        filter={filter}
        onFilter={setFilter}
        counted={counted}
        decades={decades}
        decade={decadeNow}
        onDecade={setDecade}
      />
      <DataTable
        label="Tracklist"
        columns={columns({ edit, remove, compact, counted })}
        rows={lines}
        rowKey={(l) => keyOf(l.index, editing)}
        sort={sortNow}
        onSort={setSort}
        noun="track"
        resetKey={`${filter}-${decadeNow ?? ''}`}
        revealKey={editing === null ? null : keyOf(editing, editing)}
        fullRow={(l) => {
          if (editing === l.index) {
            return (
              <EditLine
                row={l.row}
                onSave={(patch) => {
                  editMixRow(l.index, patch);
                  edit(null);
                }}
                onCancel={() => edit(null)}
              />
            );
          }
          if (l.row.gap) {
            return <GapLine row={l.row} onDelete={() => remove(l.index)} />;
          }
          return null;
        }}
      />
      <div class="mix-under">
        <Button
          icon="add"
          onClick={() => {
            addMixRow();
            // A new row is To review and has no clip count: show it.
            setFilter('all');
            edit(mixRows.value.length - 1);
          }}
        >
          Add track
        </Button>
        <Button variant="filled" onClick={onSaveMix}>
          {saved ? 'Saved ✓' : 'Save mix'}
        </Button>
      </div>
      {showSaveError && <StatusLine kind="error">{saveError}</StatusLine>}
    </div>
  );
}
