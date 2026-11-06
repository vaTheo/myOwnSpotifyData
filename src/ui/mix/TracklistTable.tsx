import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { MixRowSource, TracklistRow } from '../../db/schema';
import {
  libraryTitleIndex,
  matchMixRow,
  type MixMatch,
} from '../../features/mix/match';
import { parseClock } from '../../features/mix/parse';
import { isIdentified } from '../../features/mix/spotifySearch';
import { viewRows, type RowSort } from '../../features/mix/worker';
import {
  addMixRow,
  deleteMixRow,
  editMixRow,
  mixError,
  mixRows,
  model,
  saveMix,
} from '../../model/state';
import { Button } from '../components/Button';
import { FeaturePills } from '../components/FeaturePills';
import { Flag } from '../components/Flag';
import { IconButton } from '../components/IconButton';
import { NoData } from '../components/NoData';
import { StatusLine } from '../components/StatusLine';
import { TextField } from '../components/TextField';
import { formatClock, plural } from '../format';
import { Icon, type IconName } from '../icons';
import { DataTable, type Column } from '../table/DataTable';
import type { SortState } from '../table/sort';
import { Clues } from './Clues';
import { RowMenu, type RowMenuItem } from './RowMenu';
import {
  confidenceShort,
  confidenceText,
  gapCluesSummary,
  originText,
  referencesText,
  sourceLabel,
  timeText,
} from './rowText';

/** One line of the table: the row, its place in `mixRows`, its library match. */
interface Line {
  row: TracklistRow;
  index: number;
  match: MixMatch | null;
}

/** No header sort: the order is the set's, or the Sort select's (round 004). */
const NO_SORT = signal<SortState>({ columnId: null, direction: 'asc' });

const SOURCE_ICON: Record<MixRowSource, IconName> = {
  trackid: 'search',
  description: 'info',
  pasted: 'queue_music',
  manual: 'edit',
  tracklistify: 'computer',
};

/** Spotify search, never a track page: the app holds no id for the mix track. */
function searchUrl(row: TracklistRow): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${row.artist} ${row.title}`)}`;
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
 * Artist – Title, and under it what a round-003 row must show in words: the
 * **not heard** badge of a candidate, the origin ("second listen · +4 %",
 * "from a comment by …"), the clue in quotes (plain text, two lines at
 * most), then the references.
 */
function TitleCell(p: { line: Line }) {
  const { row } = p.line;
  const origin = originText(row);
  const refs = referencesLine(p.line);
  const quote = row.origin === 'clue' && row.clue ? row.clue.text : null;
  const second = row.origin === 'clue' || origin !== null || refs !== null;
  return (
    <span class="mix-title-cell">
      <span class="dt-text mix-name">
        {row.artist} – {row.title}
      </span>
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

function columns(on: {
  edit: (index: number) => void;
  remove: (index: number) => void;
}): Column<Line>[] {
  return [
    {
      id: 'time',
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
      header: 'Artist – Title',
      priority: 1,
      width: 'minmax(200px, 1fr)',
      cell: (l) => <TitleCell line={l} />,
      title: (l) => `${l.row.artist} – ${l.row.title}`,
      compact: 'title',
    },
    {
      id: 'label',
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
      header: 'Source',
      priority: 2,
      width: '64px',
      cell: (l) => <SourceCell row={l.row} />,
      compact: 'meta',
    },
    {
      id: 'confidence',
      header: 'Confidence',
      align: 'end',
      priority: 2,
      width: '112px',
      cell: (l) => <ConfidenceCell row={l.row} />,
      title: (l) => confidenceText(l.row) ?? undefined,
      compact: 'meta',
    },
    {
      id: 'library',
      header: 'In your library',
      priority: 1,
      width: '120px',
      cell: (l) =>
        l.match ? (
          <span class="mix-library">
            <FeaturePills trackId={l.match.trackId} />
          </span>
        ) : null,
      compact: 'meta',
    },
    {
      id: 'more',
      header: 'More',
      headerHidden: true,
      align: 'end',
      priority: 1,
      width: '64px',
      cell: (l) => {
        const name = `${l.row.artist} – ${l.row.title}`;
        const items: RowMenuItem[] = [
          { label: 'Edit', onSelect: () => on.edit(l.index) },
          { label: 'Delete', onSelect: () => on.remove(l.index) },
        ];
        if (isIdentified(l.row)) {
          items.push({ label: 'Search on Spotify', href: searchUrl(l.row) });
        }
        return <RowMenu label={`More for ${name}`} items={items} />;
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
 * Round 004's view controls, shown only when a row has clip counts (so a
 * mix from before round 004 has no empty control), at every width: phones
 * have no header sort. They hide rows, never delete them.
 */
function RowView(p: {
  rows: readonly TracklistRow[];
  sort: RowSort;
  onSort: (sort: RowSort) => void;
  heardOnce: boolean;
  onHeardOnce: (on: boolean) => void;
}) {
  return (
    <div class="mix-rowview">
      <label>
        Sort{' '}
        <select
          id="mix-sort"
          value={p.sort}
          onChange={(e) =>
            p.onSort((e.currentTarget as HTMLSelectElement).value as RowSort)
          }
        >
          <option value="time">Time</option>
          <option value="clips">Clips heard</option>
          <option value="score">Best score</option>
        </select>
      </label>
      <Button
        id="mix-heard-once"
        variant="outlined"
        icon={p.heardOnce ? 'check' : undefined}
        aria-pressed={p.heardOnce}
        onClick={() => p.onHeardOnce(!p.heardOnce)}
      >
        Only tracks heard once ({p.rows.filter((r) => r.hits === 1).length})
      </Button>
      {p.heardOnce && (
        <span class="mix-caption">
          The others are hidden, not deleted; Create playlist uses every row.
        </span>
      )}
    </div>
  );
}

/** The row key: the edited row remounts its fields, so Cancel drops the typing. */
function keyOf(index: number, editing: number | null): string {
  return `${index}${editing === index ? '-edit' : ''}`;
}

/**
 * The open mix's tracklist (spec 003 §12, T082, T120; S08 fix 1 row layout)
 * on `DataTable`. Rows keep their place in `mixRows`, so Edit and Delete act
 * on the real row whatever the Sort. Edit, Delete and the Spotify search sit
 * in each row's More menu; a gap keeps a visible Delete. Library matches are
 * computed here, at render, never stored. Under the table: Add track (the
 * new row is paged in and focused) and Save mix ("Saved ✓" for 2 s; a
 * failure shows `mixError` beside the button, never the tick).
 */
export function TracklistTable(p: { showSaveError?: boolean } = {}) {
  const rows = mixRows.value;
  const m = model.value;
  const index = m ? libraryTitleIndex(m) : null;
  const [editing, setEditing] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  // The save's own failure, kept apart from `mixError` (which other
  // actions also set) and cleared by the next action on the table.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sort, setSortState] = useState<RowSort>('time');
  const [heardOnce, setHeardOnceState] = useState(false);
  const setSort = (v: RowSort): void => {
    setSaveError(null);
    setSortState(v);
  };
  const setHeardOnce = (v: boolean): void => {
    setSaveError(null);
    setHeardOnceState(v);
  };
  const edit = (i: number | null): void => {
    setSaveError(null);
    setEditing(i);
  };
  const counted = rows.some((r) => r.hits !== undefined);
  const order = counted
    ? viewRows(rows, sort, heardOnce)
    : rows.map((_, i) => i);
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
        // mixError says why, here; never "Saved ✓".
        setSaveError(mixError.peek());
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    })();
  };

  return (
    <div class="mix-tracklist">
      {counted && (
        <RowView
          rows={rows}
          sort={sort}
          onSort={setSort}
          heardOnce={heardOnce}
          onHeardOnce={setHeardOnce}
        />
      )}
      <DataTable
        label="Tracklist"
        columns={columns({ edit, remove })}
        rows={lines}
        rowKey={(l) => keyOf(l.index, editing)}
        sort={NO_SORT.value}
        onSort={() => undefined}
        noun="track"
        resetKey={`${sort}-${heardOnce}`}
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
            // A new row has no clip count: show it whatever the view.
            setHeardOnce(false);
            edit(mixRows.value.length - 1);
          }}
        >
          Add track
        </Button>
        <Button variant="filled" onClick={onSaveMix}>
          {saved ? 'Saved ✓' : 'Save mix'}
        </Button>
      </div>
      {saveError !== null && p.showSaveError !== false && (
        <StatusLine kind="error">{saveError}</StatusLine>
      )}
    </div>
  );
}
