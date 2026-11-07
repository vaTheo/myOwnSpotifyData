import { useMemo } from 'preact/hooks';
import { signal } from '@preact/signals';
import {
  RARE_COUNTS,
  rarelyPlayed,
  type RareCount,
  type RareItem,
} from '../../model/rarelyPlayed';
import { historySummary, model } from '../../model/state';
import { EMPTY_FILTER } from '../filters/trackFilter';
import { formatDate, plural } from '../format';
import { countColumn } from '../table/columns';
import { rareCounts, rarePlaylist } from './selections';
import { CrateSheet, CrateTable, DEFAULT_SORT, crateColumns } from './shared';

const sort = signal(DEFAULT_SORT);
const filter = signal(EMPTY_FILTER);

const CHIP: Record<RareCount, string> = {
  0: 'Never',
  1: '1 play',
  2: '2 plays',
  3: '3 plays',
};

/** Turning the last chip off keeps it on: the view always has a count. */
function toggle(count: RareCount) {
  const next = new Set(rareCounts.value);
  if (next.has(count)) {
    if (next.size > 1) next.delete(count);
  } else {
    next.add(count);
  }
  rareCounts.value = next;
}

function countsLabel(counts: ReadonlySet<RareCount>): string {
  if (counts.size === 1 && counts.has(0)) return 'never played';
  return `${[...counts].sort().join(', ')} plays`;
}

function playlistsCell(item: RareItem): string {
  const m = model.value;
  const names = item.playlistIds.map(
    (id) => m?.playlistsById.get(id)?.name ?? id
  );
  return names.length > 1
    ? `${names[0]} +${names.length - 1}`
    : (names[0] ?? '');
}

export function Rarely({ detail }: { detail?: string }) {
  const m = model.value;
  const counts = rareCounts.value;
  const playlistId = rarePlaylist.value;
  // A playlist that no longer exists falls back to all of them.
  const chosen =
    playlistId && m?.playlistsById.has(playlistId) ? playlistId : null;
  const items = useMemo(
    () => (m ? rarelyPlayed(m, counts, chosen) : []),
    [m, counts, chosen]
  );
  const columns = useMemo(
    () =>
      crateColumns<RareItem>({
        metrics: [
          countColumn('plays', 'Plays', (item) => item.plays, {
            unit: ['play', 'plays'],
          }),
          {
            id: 'playlists',
            header: 'Playlists',
            align: 'start',
            priority: 3,
            width: 'minmax(80px, 1.2fr)',
            sortValue: (item) => playlistsCell(item),
            cell: (item) => <span>{playlistsCell(item)}</span>,
            compact: 'hidden',
          },
        ],
        flag: () => null,
      }),
    [m]
  );
  const imported = historySummary.value?.importedAt;
  return (
    <>
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Play counts">
          {RARE_COUNTS.map((c) => {
            const on = counts.has(c);
            return (
              <button
                type="button"
                key={c}
                class={on ? 'active' : ''}
                aria-pressed={on}
                onClick={() => toggle(c)}
              >
                <span>{CHIP[c]}</span>
              </button>
            );
          })}
        </div>
        <label class="rare-playlist">
          <span class="visually-hidden">Playlist</span>
          <select
            aria-label="Playlist"
            value={chosen ?? ''}
            onChange={(e) => {
              rarePlaylist.value = e.currentTarget.value || null;
            }}
          >
            <option value="">All playlists</option>
            {(m?.playlists ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p class="caption" role="status">
        {plural(items.length, 'track')}
        {imported ? ` · plays counted to ${formatDate(imported)}` : ''}
      </p>
      {items.length === 0 ? (
        <div class="empty">
          <p>
            {chosen
              ? 'Nothing to listen to in this playlist.'
              : `Nothing ${countsLabel(counts)} in your playlists.`}
          </p>
          {counts.size < RARE_COUNTS.length && (
            <button
              type="button"
              onClick={() => {
                rareCounts.value = new Set(RARE_COUNTS);
              }}
            >
              Try 0 to 3 plays
            </button>
          )}
        </div>
      ) : (
        <CrateTable
          label={`Playlist songs played ${countsLabel(counts)}`}
          items={items}
          columns={columns}
          sort={sort}
          filter={filter}
          resetKey={`${[...counts].sort().join('')}|${chosen ?? ''}`}
          detail={detail}
        />
      )}
      <CrateSheet detail={detail} />
    </>
  );
}
