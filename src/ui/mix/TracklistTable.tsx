import { useEffect, useRef, useState } from 'preact/hooks';
import type { TracklistRow } from '../../db/schema';
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
  linkMixRowSpotify,
  mixCheckSaved,
  mixError,
  mixRows,
  model,
  saveMix,
  unlinkMixRowSpotify,
} from '../../model/state';
import { Button } from '../components/Button';
import { Flag } from '../components/Flag';
import { IconButton } from '../components/IconButton';
import { NoData } from '../components/NoData';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { StatusLine } from '../components/StatusLine';
import { TextField } from '../components/TextField';
import { formatClock, plural } from '../format';
import { Icon } from '../icons';
import { windowClass } from '../layout/windowClass';
import { yearColumn } from '../table/columns';
import { DataTable, type Column } from '../table/DataTable';
import { nextSort, type SortState } from '../table/sort';
import { Clues } from './Clues';
import { LinkForm } from './LinkForm';
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
  listenIcons,
  originText,
  playLinks,
  referencesText,
  rowYear,
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

/** Spotify search, for a track the check has not found. */
function searchUrl(row: TracklistRow): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${row.artist} ${row.title}`)}`;
}

function nameOf(row: TracklistRow): string {
  return `${row.artist} – ${row.title}`;
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
function listenItems(l: Line): RowMenuItem[] {
  const { row } = l;
  if (!isIdentified(row)) return [];
  // The direct pages first, then the search pages (the other platforms have
  // no page the app may find by name, ADR-04).
  const links: { label: string; href: string; app?: true }[] = [
    ...playLinks(row, l.match?.trackId ?? null),
    ...digLinks(row.artist, row.title),
  ];
  return links.map((x) => ({ label: x.label, href: x.href, app: x.app }));
}

/**
 * Artist – Title, and under it what a round-003 row must show in words: the
 * **not heard** badge of a candidate, the origin
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

/**
 * Confidence, Clips folded in (round 010): "×3 · 92%" in the column; the
 * full "heard 3× · best 92 %" for a screen reader, in the tooltip, and on a
 * phone's meta line.
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
 * Spotify (T117, T118, round 010): one 48 px icon — when the check found
 * the track, the app's own link (`spotify:track:<id>`), opened in place;
 * else Not checked or Not found, each with its words for screen readers and
 * in the tooltip. On a phone, the words on the meta line (Play on Spotify
 * is in More's Listen list).
 */
function SpotifyCell(p: {
  row: TracklistRow;
  compact: boolean;
  onLink: () => void;
}) {
  const { row } = p;
  if (!isIdentified(row)) return null;
  const status = spotifyStatus(row);
  const app =
    typeof row.spotify === 'object' ? `spotify:track:${row.spotify.id}` : null;
  const play = `Play ${nameOf(row)} on Spotify`;
  // Round 011: the red mark opens the form to paste a Spotify track link.
  const link = `Link a Spotify track to ${nameOf(row)}`;
  if (status === 'notFound') {
    return p.compact ? (
      <button
        type="button"
        class="mix-spotify-text notFound mix-link-open"
        aria-label={link}
        title={link}
        onClick={p.onLink}
      >
        {STATUS_TEXT.notFound}
      </button>
    ) : (
      <IconButton
        icon="error"
        class="mix-spotify notFound"
        label={link}
        onClick={p.onLink}
      />
    );
  }
  if (p.compact) {
    return status === 'unchecked' ? null : (
      <span class={`mix-spotify-text ${status}`}>{STATUS_TEXT[status]}</span>
    );
  }
  if (app !== null) {
    return (
      <IconButton
        icon="play_arrow"
        class="mix-spotify found"
        label={play}
        href={app}
      />
    );
  }
  return (
    <span class={`mix-spotify ${status}`} title={STATUS_TEXT[status]}>
      <Icon name="schedule" size={20} />
      <span class="visually-hidden">{STATUS_TEXT[status]}</span>
    </span>
  );
}

/**
 * Shazam and SoundCloud as icon links (round 010), new tab: beside the
 * Listen menu, and on a phone's meta line.
 */
function ListenIcons(p: { row: TracklistRow }) {
  const icons = listenIcons(p.row);
  if (icons.length === 0) return null;
  return (
    <span class="mix-listen-icons">
      {icons.map((i) => (
        <IconButton
          key={i.site}
          icon={i.site}
          label={i.label}
          href={i.href}
          external
        />
      ))}
    </span>
  );
}

/**
 * Review (T118, round 010): ✕ removes the track (the same `deleteMixRow`
 * as Delete), for a track found wrongly. Every track is kept otherwise, so
 * there is no Validate. On a phone the column hides; Delete is in More.
 */
function ReviewCell(p: { line: Line; onRemove: () => void }) {
  return (
    <span class="mix-review">
      <IconButton
        icon="close"
        label={`Remove ${nameOf(p.line.row)}`}
        onClick={p.onRemove}
      />
    </span>
  );
}

function columns(on: {
  edit: (index: number) => void;
  remove: (index: number) => void;
  link: (index: number) => void;
  unlink: (index: number) => void;
  compact: boolean;
}): Column<Line>[] {
  const { compact } = on;
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
      cell: (l) => (
        <SpotifyCell
          row={l.row}
          compact={compact}
          onLink={() => on.link(l.index)}
        />
      ),
      compact: 'meta',
    },
    {
      id: 'listen',
      header: 'Listen',
      priority: 2,
      // The Shazam and SoundCloud icons, then the menu: three 48 px targets.
      width: '144px',
      cell: (l) => {
        const items = listenItems(l);
        return items.length === 0 ? null : (
          <span class="mix-listen">
            <ListenIcons row={l.row} />
            <RowMenu
              icon="headphones"
              label={`Listen to ${nameOf(l.row)}`}
              items={items}
            />
          </span>
        );
      },
      // On a phone the icons join the meta line; the menu is in More.
      compactCell: (l) => <ListenIcons row={l.row} />,
      compact: 'meta',
    },
    {
      id: 'review',
      header: 'Review',
      priority: 1,
      width: '48px',
      cell: (l) => <ReviewCell line={l} onRemove={() => on.remove(l.index)} />,
      compact: 'hidden',
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
        // A found track opens from the Listen menu's Play on Spotify.
        if (typeof row.spotify !== 'object' && isIdentified(row)) {
          items.push({ label: 'Search on Spotify', href: searchUrl(row) });
        }
        // Round 011: a link the owner pasted can be replaced or removed.
        if (row.spotifyBy === 'owner') {
          items.push(
            { label: 'Replace link', onSelect: () => on.link(l.index) },
            { label: 'Remove link', onSelect: () => on.unlink(l.index) }
          );
        }
        // On a phone one "Listen…" item opens the Listen links in the same
        // list, so More stays short (fix round 1, R3).
        const listen = compact ? listenItems(l) : [];
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
 * The review's filter chips (T118, T127, round 010): All, Not on Spotify
 * with their counts, and Heard once (N) when a row has clip counts; one at
 * a time. They hide rows, never delete them. Round 004's Sort select and
 * its direction button beside them whenever there are rows (phones have no
 * header sort).
 */
function RowView(p: {
  rows: readonly TracklistRow[];
  sort: SortState;
  onSort: (sort: SortState) => void;
  filter: ReviewFilter;
  onFilter: (filter: ReviewFilter) => void;
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
            icon={
              p.sort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'
            }
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

/**
 * The row key: the edited (or linking, round 012) row remounts its fields,
 * so Cancel drops the typing.
 */
function keyOf(
  index: number,
  editing: number | null,
  linking: number | null
): string {
  if (editing === index) return `${index}-edit`;
  if (linking === index) return `${index}-link`;
  return `${index}`;
}

/**
 * The open mix's tracklist (spec 003 §12, T082, T118, T120, T127; S08 fix
 * 1 row layout) on `DataTable`. Rows keep their place in `mixRows`, so
 * Edit, Delete and Review act on the real row whatever the filter or the
 * Sort. Each row: Spotify status, Listen menu, ✕, and More (Edit,
 * Delete, Search on Spotify; Replace link and Remove link on a row the
 * owner linked, round 012). Library matches are computed here, at
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
  const [linking, setLinking] = useState<number | null>(null);
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
    setLinking(null);
    setEditing(i);
  };
  // Round 011: the row whose pasted-link form is open; one form at a time.
  const link = (i: number | null): void => {
    setSaveError(null);
    setEditing(null);
    setLinking(i);
  };
  const unlink = (i: number): void => {
    unlinkMixRowSpotify(i);
    link(null);
  };
  const open = editing ?? linking;
  // The Sort, the decade and the chip, with their fallbacks (round 005).
  const view = tracklistView(rows, { decade, filter }, open);
  const { decades, order } = view;
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
        decades={decades}
        decade={decadeNow}
        onDecade={setDecade}
      />
      <DataTable
        label="Tracklist"
        columns={columns({ edit, remove, link, unlink, compact })}
        rows={lines}
        rowKey={(l) => keyOf(l.index, editing, linking)}
        sort={sortNow}
        onSort={setSort}
        noun="track"
        resetKey={`${filter}-${decadeNow ?? ''}`}
        revealKey={open === null ? null : keyOf(open, editing, linking)}
        fullRow={(l) => {
          if (linking === l.index) {
            // Replace link: the form opens on the pasted track, with Remove.
            const owned =
              l.row.spotifyBy === 'owner' && typeof l.row.spotify === 'object'
                ? l.row.spotify.id
                : null;
            return (
              <LinkForm
                name={nameOf(l.row)}
                initial={
                  owned === null
                    ? undefined
                    : `https://open.spotify.com/track/${owned}`
                }
                onLink={(text) => {
                  const refused = linkMixRowSpotify(l.index, text);
                  if (refused === null) link(null);
                  return refused;
                }}
                onCancel={() => link(null)}
                onRemove={owned === null ? undefined : () => unlink(l.index)}
              />
            );
          }
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
            // A new row has no clip count: show it.
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
