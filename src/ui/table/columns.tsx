import type { ComponentChildren } from 'preact';
import type { ArtistRef, Period } from '../../db/schema';
import type { PlaysInfo } from '../../model/aggregate';
import type { ResolvedFeature } from '../../model/features';
import { Flag } from '../components/Flag';
import { BpmText, KeyPill } from '../components/KeyPill';
import { NoData } from '../components/NoData';
import { SpotifyLink } from '../components/SpotifyLink';
import { artistNames, formatDate, PERIOD_LABEL } from '../format';
import { Icon } from '../icons';
import type { Column } from './DataTable';
import { formatDuration, keySortValue } from './columnValues';

/**
 * The shared column builders of the tables (spec 003, contracts/components.md).
 * Each takes an accessor from the screen's row type and returns a
 * `Column<Row>` with the priority, width, alignment, first sort direction and
 * compact place the contract gives that column. The last argument, `over`,
 * overrides any field of the result (a screen that wants the rank on phones
 * passes `{ compact: 'lead' }`). A missing value is always `NoData`, never a
 * zero (FR-021).
 */
type Over<Row> = Partial<Column<Row>>;

/** The "N units" tail of a number, shown only in the two-line item of a phone. */
function Unit(p: { n: number; unit: [string, string] }) {
  return <span class="dt-unit">{p.n === 1 ? p.unit[0] : p.unit[1]}</span>;
}

/** The text of a cell, cut with an ellipsis; the column's `title` shows it whole. */
function Text(p: { children: ComponentChildren }) {
  return <span class="dt-text">{p.children}</span>;
}

/** `#`: the row's rank, computed before sorting; sorting by it restores the ranking. */
export function rankColumn<Row>(over: Over<Row> = {}): Column<Row> {
  return {
    id: 'rank',
    header: '#',
    align: 'end',
    priority: 1,
    width: '56px',
    rank: true,
    cell: (_row, rank) => <span class="dt-rank">{rank}</span>,
    compact: 'hidden',
    ...over,
  };
}

/** A 40 px cover or artist image; `round` for artists. Hides first (priority 3). */
export function coverColumn<Row>(
  imageOf: (row: Row) => string | null | undefined,
  opts: { round?: boolean } = {},
  over: Over<Row> = {}
): Column<Row> {
  return {
    id: 'cover',
    header: 'Cover',
    headerHidden: true,
    priority: 3,
    width: '56px',
    cell: (row) => {
      const url = imageOf(row);
      const cls = opts.round ? 'dt-cover round' : 'dt-cover';
      return url ? (
        <img class={cls} src={url} loading="lazy" alt="" />
      ) : (
        <span class={cls} aria-hidden="true" />
      );
    },
    compact: 'lead',
    ...over,
  };
}

/**
 * The title (or the name of an artist or a playlist). With `hrefOf` the text
 * is a link, so a middle click or a long press works; the row opens the same
 * place.
 */
export function titleColumn<Row>(
  textOf: (row: Row) => string,
  opts: { header?: string; hrefOf?: (row: Row) => string | null } = {},
  over: Over<Row> = {}
): Column<Row> {
  return {
    id: 'title',
    header: opts.header ?? 'Title',
    priority: 1,
    width: 'minmax(0, 2fr)',
    sortValue: textOf,
    firstDirection: 'asc',
    cell: (row) => {
      const href = opts.hrefOf?.(row);
      return href ? (
        <a class="dt-link" href={href}>
          <Text>{textOf(row)}</Text>
        </a>
      ) : (
        <Text>{textOf(row)}</Text>
      );
    },
    title: textOf,
    compact: 'title',
    ...over,
  };
}

/** The artists, joined with commas; A to Z first. Priority 2. */
export function artistsColumn<Row>(
  artistsOf: (row: Row) => ArtistRef[],
  over: Over<Row> = {}
): Column<Row> {
  return {
    id: 'artists',
    header: 'Artists',
    priority: 2,
    width: 'minmax(0, 1.5fr)',
    sortValue: (row) => artistNames(artistsOf(row)),
    firstDirection: 'asc',
    cell: (row) => <Text>{artistNames(artistsOf(row))}</Text>,
    title: (row) => artistNames(artistsOf(row)),
    compact: 'subtitle',
    ...over,
  };
}

/** The album name. Priority 3; not in the two-line item. */
export function albumColumn<Row>(
  albumOf: (row: Row) => string | null,
  over: Over<Row> = {}
): Column<Row> {
  return {
    id: 'album',
    header: 'Album',
    priority: 3,
    width: 'minmax(0, 1.2fr)',
    sortValue: albumOf,
    firstDirection: 'asc',
    cell: (row) => {
      const album = albumOf(row);
      return album ? <Text>{album}</Text> : <NoData />;
    },
    title: (row) => albumOf(row) ?? undefined,
    compact: 'hidden',
    ...over,
  };
}

/** The length as `3:35`, longest first. Priority 3. */
export function durationColumn<Row>(
  msOf: (row: Row) => number | null,
  over: Over<Row> = {}
): Column<Row> {
  return {
    id: 'duration',
    header: 'Length',
    align: 'end',
    priority: 3,
    width: '80px',
    sortValue: msOf,
    firstDirection: 'desc',
    cell: (row) => {
      const ms = msOf(row);
      return ms === null ? <NoData /> : <span>{formatDuration(ms)}</span>;
    },
    compact: 'hidden',
    ...over,
  };
}

/** The date the track was added (ISO text or an epoch), newest first. Priority 3. */
export function addedColumn<Row>(
  addedOf: (row: Row) => string | number | null,
  over: Over<Row> = {}
): Column<Row> {
  return {
    id: 'added',
    header: 'Added',
    priority: 3,
    width: '120px',
    sortValue: (row) => {
      const v = addedOf(row);
      if (v === null) return null;
      const t = typeof v === 'number' ? v : Date.parse(v);
      return Number.isNaN(t) ? null : t;
    },
    firstDirection: 'desc',
    cell: (row) => {
      const v = addedOf(row);
      return v === null || Number.isNaN(new Date(v).getTime()) ? (
        <NoData />
      ) : (
        <span>{formatDate(v)}</span>
      );
    },
    compact: 'hidden',
    ...over,
  };
}

/**
 * A count (saved tracks, tracks, plays of a playlist). `unit` is the
 * singular and plural noun a phone's two-line item appends: "12 saved
 * tracks". Most first. Priority 1 unless overridden.
 */
export function countColumn<Row>(
  id: string,
  header: string,
  countOf: (row: Row) => number | null,
  opts: { unit?: [string, string] } = {},
  over: Over<Row> = {}
): Column<Row> {
  return {
    id,
    header,
    align: 'end',
    priority: 1,
    width: '120px',
    sortValue: countOf,
    firstDirection: 'desc',
    cell: (row) => {
      const n = countOf(row);
      if (n === null) return <NoData />;
      return (
        <span>
          {n.toLocaleString()}
          {opts.unit && <Unit n={n} unit={opts.unit} />}
        </span>
      );
    },
    compact: 'meta',
    ...over,
  };
}

/**
 * Plays from the history export, most first. No history gives `NoData`, not
 * zero. A count matched by artist and title rather than by track id carries
 * an info icon whose tooltip says so (the old "(by artist and title)").
 */
export function playsColumn<Row>(
  playsOf: (row: Row) => PlaysInfo | null,
  over: Over<Row> = {}
): Column<Row> {
  return {
    id: 'plays',
    header: 'Plays',
    align: 'end',
    priority: 1,
    width: '88px',
    sortValue: (row) => playsOf(row)?.plays ?? null,
    firstDirection: 'desc',
    cell: (row) => {
      const plays = playsOf(row);
      if (!plays) return <NoData />;
      const byName = plays.source === 'name';
      return (
        <span class="dt-plays">
          {byName && (
            <span
              class="dt-note"
              role="img"
              aria-label="Counted by artist and title"
              title="Counted by artist and title"
            >
              <Icon name="info" size={14} />
            </span>
          )}
          {plays.plays.toLocaleString()}
          <Unit n={plays.plays} unit={['play', 'plays']} />
        </span>
      );
    },
    compact: 'meta',
    ...over,
  };
}

/**
 * The number of playlists holding the track, or the "not in a playlist" flag
 * at 0 when the owner has any playlist at all. Most first. Priority 2.
 */
export function playlistsColumn<Row>(
  countOf: (row: Row) => number,
  hasPlaylists: boolean,
  over: Over<Row> = {}
): Column<Row> {
  return {
    id: 'playlists',
    header: 'Playlists',
    align: 'end',
    priority: 2,
    width: '152px',
    sortValue: countOf,
    firstDirection: 'desc',
    cell: (row) => {
      const n = countOf(row);
      return n === 0 && hasPlaylists ? (
        <Flag kind="todo">not in a playlist</Flag>
      ) : (
        <span>{n.toLocaleString()}</span>
      );
    },
    compact: 'hidden',
    ...over,
  };
}

/** One "Top 4 weeks" flag per period the track is in. Priority 3. */
export function topFlagsColumn<Row>(
  periodsOf: (row: Row) => Period[],
  over: Over<Row> = {}
): Column<Row> {
  return {
    id: 'top',
    header: 'Top',
    priority: 3,
    width: 'minmax(0, 1.2fr)',
    sortValue: (row) => periodsOf(row).length,
    firstDirection: 'desc',
    cell: (row) => (
      <span class="dt-flags">
        {periodsOf(row).map((p) => (
          <Flag key={p} kind="top">
            {`Top ${PERIOD_LABEL[p]}`}
          </Flag>
        ))}
      </span>
    ),
    compact: 'hidden',
    ...over,
  };
}

/** BPM from rekordbox or ReccoBeats, lowest first; `NoData` when unknown. */
export function bpmColumn<Row>(
  featureOf: (row: Row) => ResolvedFeature | null,
  over: Over<Row> = {}
): Column<Row> {
  return {
    id: 'bpm',
    header: 'BPM',
    align: 'end',
    priority: 1,
    width: '76px',
    sortValue: (row) => featureOf(row)?.bpm ?? null,
    firstDirection: 'asc',
    cell: (row) => {
      const bpm = featureOf(row)?.bpm ?? null;
      return bpm === null ? <NoData /> : <BpmText bpm={bpm} />;
    },
    compact: 'meta',
    ...over,
  };
}

/** The key as a pill in the owner's notation, sorted in Camelot order. */
export function keyColumn<Row>(
  featureOf: (row: Row) => ResolvedFeature | null,
  over: Over<Row> = {}
): Column<Row> {
  return {
    id: 'key',
    header: 'Key',
    priority: 1,
    width: '76px',
    sortValue: (row) => {
      const f = featureOf(row);
      return keySortValue(f?.key ?? null, f?.major ?? null);
    },
    firstDirection: 'asc',
    cell: (row) => {
      const f = featureOf(row);
      return f && f.key !== null && f.major !== null ? (
        <KeyPill musicalKey={f.key} major={f.major} />
      ) : (
        <NoData />
      );
    },
    compact: 'meta',
    ...over,
  };
}

/** The "Open in Spotify" icon button, 48 px. Priority 2; the trail of a phone's item. */
export function spotifyLinkColumn<Row>(
  urlOf: (row: Row) => string | null | undefined,
  over: Over<Row> = {}
): Column<Row> {
  return {
    id: 'spotify',
    header: 'Open in Spotify',
    headerHidden: true,
    priority: 2,
    width: '64px',
    cell: (row) => <SpotifyLink href={urlOf(row)} />,
    compact: 'trail',
    ...over,
  };
}
