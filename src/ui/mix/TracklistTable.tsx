import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
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
  mixRows,
  model,
  saveMix,
} from '../../model/state';
import { Button } from '../components/Button';
import { FeaturePills } from '../components/FeaturePills';
import { Flag } from '../components/Flag';
import { IconButton } from '../components/IconButton';
import { NoData } from '../components/NoData';
import { SpotifyLink } from '../components/SpotifyLink';
import { TextField } from '../components/TextField';
import { formatClock, plural } from '../format';
import { Icon, type IconName } from '../icons';
import { DataTable, type Column } from '../table/DataTable';
import type { SortState } from '../table/sort';
import { Clues } from './Clues';
import {
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

/**
 * Source: an icon named by its tooltip, then, for a round-003 row, the
 * origin as visible text; a candidate always carries **not heard** and the
 * clue's own words in quotes (plain text).
 */
function SourceCell(p: { row: TracklistRow }) {
  const { row } = p;
  const label = sourceLabel(row);
  const origin = originText(row);
  return (
    <span class="mix-source">
      <span class="mix-source-icon" title={label}>
        <Icon name={SOURCE_ICON[row.source]} size={18} />
        <span class="visually-hidden">{label}</span>
      </span>
      {row.origin === 'clue' && <Flag kind="todo">not heard</Flag>}
      {origin !== null && <span class="mix-origin">{origin}</span>}
      {row.origin === 'clue' && row.clue && (
        <span class="mix-quote">“{row.clue.text}”</span>
      )}
    </span>
  );
}

function confidenceCell(row: TracklistRow): string | null {
  const parts = [confidenceText(row), referencesText(row)].filter(
    (s): s is string => s !== null
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

function LibraryCell(p: { match: MixMatch | null }) {
  const { match } = p;
  if (!match) return null;
  return (
    <span class="mix-library">
      <FeaturePills trackId={match.trackId} />
      {match.playlistCount > 0 && (
        <span class="mix-in">in {plural(match.playlistCount, 'playlist')}</span>
      )}
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
      width: '80px',
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
      width: 'minmax(0, 2fr)',
      cell: (l) => (
        <span class="dt-text">
          {l.row.artist} – {l.row.title}
        </span>
      ),
      title: (l) => `${l.row.artist} – ${l.row.title}`,
      compact: 'title',
    },
    {
      id: 'label',
      header: 'Label',
      priority: 3,
      width: 'minmax(0, 1fr)',
      cell: (l) =>
        l.row.label ? <span class="dt-text">{l.row.label}</span> : null,
      title: (l) => l.row.label ?? undefined,
      compact: 'subtitle',
    },
    {
      id: 'source',
      header: 'Source',
      priority: 2,
      width: 'minmax(0, 1.4fr)',
      cell: (l) => <SourceCell row={l.row} />,
      title: (l) => sourceTitle(l.row),
      compact: 'meta',
    },
    {
      id: 'confidence',
      header: 'Confidence · references',
      priority: 2,
      width: 'minmax(0, 1fr)',
      cell: (l) => {
        const text = confidenceCell(l.row);
        return text === null ? null : <span class="dt-text">{text}</span>;
      },
      title: (l) => confidenceCell(l.row) ?? undefined,
      compact: 'meta',
    },
    {
      id: 'library',
      header: 'In your library',
      priority: 1,
      width: '136px',
      cell: (l) => <LibraryCell match={l.match} />,
      compact: 'meta',
    },
    {
      id: 'actions',
      header: 'Actions',
      headerHidden: true,
      align: 'end',
      priority: 1,
      width: '160px',
      cell: (l) => {
        const name = `${l.row.artist} – ${l.row.title}`;
        return (
          <span class="mix-actions">
            {isIdentified(l.row) && <SpotifyLink href={searchUrl(l.row)} />}
            <IconButton
              icon="edit"
              label={`Edit ${name}`}
              onClick={() => on.edit(l.index)}
            />
            <IconButton
              icon="delete"
              label={`Delete ${name}`}
              onClick={() => on.remove(l.index)}
            />
          </span>
        );
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

/** The row being edited: four text fields, Save and Cancel (`editMixRow`). */
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
  return (
    <form
      class="mix-edit"
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
      <label class="mix-check">
        <input
          id="mix-heard-once"
          type="checkbox"
          checked={p.heardOnce}
          onChange={(e) =>
            p.onHeardOnce((e.currentTarget as HTMLInputElement).checked)
          }
        />
        Only tracks heard once ({p.rows.filter((r) => r.hits === 1).length})
      </label>
      {p.heardOnce && (
        <span class="mix-caption">
          The others are hidden, not deleted; Create playlist uses every row.
        </span>
      )}
    </div>
  );
}

/**
 * The open mix's tracklist (spec 003 §12, T082, T120) on `DataTable`. Rows
 * keep their place in `mixRows`, so Edit and Delete act on the real row
 * whatever the Sort. Library matches are computed here, at render, never
 * stored. Under the table: Add track and Save mix ("Saved ✓" for 2 s; a
 * failure shows `mixError` inline instead, never the tick).
 */
export function TracklistTable() {
  const rows = mixRows.value;
  const m = model.value;
  const index = m ? libraryTitleIndex(m) : null;
  const [editing, setEditing] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [sort, setSort] = useState<RowSort>('time');
  const [heardOnce, setHeardOnce] = useState(false);
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
    setEditing(null);
  };

  const onSaveMix = (): void => {
    void (async () => {
      const ok = await saveMix();
      if (!ok) return; // mixError shows inline; never flash "Saved ✓" on it.
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
        columns={columns({ edit: setEditing, remove })}
        rows={lines}
        // The edited row remounts its fields, so a Cancel drops the typing.
        rowKey={(l) => `${l.index}${editing === l.index ? '-edit' : ''}`}
        sort={NO_SORT.value}
        onSort={() => undefined}
        noun="track"
        resetKey={`${sort}-${heardOnce}`}
        fullRow={(l) => {
          if (editing === l.index) {
            return (
              <EditLine
                row={l.row}
                onSave={(patch) => {
                  editMixRow(l.index, patch);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
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
            setEditing(mixRows.value.length - 1);
          }}
        >
          Add track
        </Button>
        <Button variant="filled" onClick={onSaveMix}>
          {saved ? 'Saved ✓' : 'Save mix'}
        </Button>
      </div>
    </div>
  );
}
