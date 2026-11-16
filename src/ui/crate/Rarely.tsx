import { useMemo } from 'preact/hooks';
import { signal } from '@preact/signals';
import { lang, msg } from '../../i18n';
import {
  RARE_COUNTS,
  rarelyPlayed,
  type RareCount,
  type RareItem,
} from '../../model/rarelyPlayed';
import { historySummary, model } from '../../model/state';
import { EMPTY_FILTER } from '../filters/trackFilter';
import { formatDate } from '../format';
import { countColumn } from '../table/columns';
import { rareCounts, rarePlaylist } from './selections';
import { CrateSheet, CrateTable, DEFAULT_SORT, crateColumns } from './shared';

const sort = signal(DEFAULT_SORT);
const filter = signal(EMPTY_FILTER);

function chip(count: RareCount): string {
  return count === 0 ? msg().crate.rarely.never : msg().n.play(count);
}

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

/** Only never played: the empty line and the table name say it apart. */
function onlyNever(counts: ReadonlySet<RareCount>): boolean {
  return counts.size === 1 && counts.has(0);
}

function countsList(counts: ReadonlySet<RareCount>): string {
  return [...counts].sort().join(', ');
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
  const text = msg().crate;
  const columns = useMemo(
    () =>
      crateColumns<RareItem>({
        metrics: [
          countColumn('plays', text.common.plays, (item) => item.plays, {
            unit: [text.common.unitPlay, text.common.unitPlays],
          }),
          {
            id: 'playlists',
            header: text.rarely.playlists,
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
    [m, lang.value]
  );
  const imported = historySummary.value?.importedAt;
  return (
    <>
      <div class="toolbar">
        <div class="segmented" role="group" aria-label={text.rarely.playCounts}>
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
                <span>{chip(c)}</span>
              </button>
            );
          })}
        </div>
        <label class="rare-playlist">
          <span class="visually-hidden">{text.rarely.playlist}</span>
          <select
            aria-label={text.rarely.playlist}
            value={chosen ?? ''}
            onChange={(e) => {
              rarePlaylist.value = e.currentTarget.value || null;
            }}
          >
            <option value="">{text.rarely.allPlaylists}</option>
            {(m?.playlists ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p class="caption" role="status">
        {msg().n.track(items.length)}
        {imported ? ' · ' + text.rarely.countedTo(formatDate(imported)) : ''}
      </p>
      {items.length === 0 ? (
        <div class="empty">
          <p>
            {chosen
              ? text.rarely.emptyPlaylist
              : onlyNever(counts)
                ? text.rarely.emptyNever
                : text.rarely.emptyPlays(countsList(counts))}
          </p>
          {counts.size < RARE_COUNTS.length && (
            <button
              type="button"
              onClick={() => {
                rareCounts.value = new Set(RARE_COUNTS);
              }}
            >
              {text.rarely.tryAll}
            </button>
          )}
        </div>
      ) : (
        <CrateTable
          label={
            onlyNever(counts)
              ? text.rarely.tableNever
              : text.rarely.tablePlays(countsList(counts))
          }
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
