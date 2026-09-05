import { reachKey } from '../db/schema';
import type { ArtistIdentityRow, ArtistReachRow } from '../db/schema';
import { playsFor, type ArtistAgg, type Model } from './aggregate';

/** One sitelink in any language is enough; `null` fails. */
export const WELL_KNOWN_MIN_SITELINKS = 1;

export interface Reach {
  listenbrainz: ArtistReachRow | undefined;
  deezer: ArtistReachRow | undefined;
  wikipedia: ArtistReachRow | undefined;
}

/**
 * What the store holds, over the candidates. `ArtistReachSummary` in
 * `src/features/reachRun.ts` extends this interface, so the stored record and
 * the live Settings line hold one identical field list.
 */
export interface ReachCoverage {
  /** Candidates: artists with a Spotify id in the owner's playlists. */
  artists: number;
  /** Candidates with at least one `ok` reach row in any source. */
  covered: number;
  /** Identities with an MBID (`mbid !== null`). */
  resolved: number;
  /** `artistReach` rows with status 'ok' for that source. */
  listenbrainz: number;
  deezer: number;
  /** Identities with at least one Wikipedia sitelink title. */
  wikipedia: number;
  /** Identities for which `isWellKnown` is true (`sitelinks >= 1`). */
  wellKnown: number;
}

/**
 * The one definition of "this source gave us a number", shared by the row
 * lines, the grouping and the coverage counts so they cannot disagree. A
 * `notFound` or `retryLater` row reads as unknown, never as a zero.
 */
function withNumber(
  row: ArtistReachRow | undefined
): ArtistReachRow | undefined {
  return row && row.status === 'ok' && row.value !== null ? row : undefined;
}

export function reachFor(model: Model, artistId: string): Reach {
  return {
    listenbrainz: withNumber(
      model.reach.get(reachKey(artistId, 'listenbrainz'))
    ),
    deezer: withNumber(model.reach.get(reachKey(artistId, 'deezer'))),
    wikipedia: withNumber(model.reach.get(reachKey(artistId, 'wikipedia'))),
  };
}

/**
 * The whole "well known" rule: the artist's Wikidata item carries at least
 * one Wikipedia article, in any language. `null` sitelinks fail and so does
 * 0; the view count and the number of languages never enter the test.
 */
export function isWellKnown(identity: ArtistIdentityRow | undefined): boolean {
  // `?? 0` collapses "no identity row" and "Wikidata has not answered" onto
  // the same answer as a real 0, which is what the rule says: no article.
  return (identity?.sitelinks ?? 0) >= WELL_KNOWN_MIN_SITELINKS;
}

/**
 * True once any history has been imported. `model.plays` is the raw array,
 * which keeps rows with no credited play, so a library of nothing but short
 * plays still counts as history.
 */
export function hasHistory(m: Model): boolean {
  return m.plays.length > 0;
}

export type ReachSort = 'plays' | 'listeners' | 'fans';
export type ReachGroup = 'radar' | 'unknown' | 'known';

export interface UnderRadarRow {
  agg: ArtistAgg;
  artistId: string;
  group: ReachGroup;
  rank: number;
  tracks: number;
  playlists: number;
  /** Sum of playsFor over the artist's tracks; 0 when no history is loaded. */
  plays: number;
  /** null means unknown, never zero. */
  listeners: number | null;
  fans: number | null;
  views: number | null;
  sitelinks: number | null;
}

const GROUP_ORDER: Record<ReachGroup, number> = {
  radar: 0,
  unknown: 1,
  known: 2,
};

/**
 * Ascending with `null` last: a missing number is not a small one. Written
 * as a comparison rather than `(a ?? Infinity) - (b ?? Infinity)`, which
 * gives NaN when both are null — the same trap compareRank documents in
 * aggregate.ts.
 */
function compareAscNullLast(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/**
 * The tail every sort ends with, so the order is total and never reshuffles.
 * The id is compared by code unit rather than with `localeCompare`, because
 * spec §2 asks for `artistId` ascending and a Spotify id is an opaque base-62
 * token, not text a locale has an opinion about.
 */
function compareName(a: UnderRadarRow, b: UnderRadarRow): number {
  return (
    a.agg.name.localeCompare(b.agg.name) ||
    (a.artistId < b.artistId ? -1 : a.artistId > b.artistId ? 1 : 0)
  );
}

function comparePlays(
  a: UnderRadarRow,
  b: UnderRadarRow,
  history: boolean
): number {
  // The fallback is per model, not per artist: switching units row by row
  // would compare 12 plays against 12 tracks in one column.
  if (!history) {
    return (
      b.tracks - a.tracks || b.playlists - a.playlists || compareName(a, b)
    );
  }
  return (
    b.plays - a.plays ||
    b.tracks - a.tracks ||
    b.playlists - a.playlists ||
    compareName(a, b)
  );
}

function compareBySort(
  a: UnderRadarRow,
  b: UnderRadarRow,
  sort: ReachSort,
  history: boolean
): number {
  if (sort === 'listeners') {
    return (
      compareAscNullLast(a.listeners, b.listeners) ||
      compareAscNullLast(a.fans, b.fans) ||
      b.plays - a.plays ||
      compareName(a, b)
    );
  }
  if (sort === 'fans') {
    return (
      compareAscNullLast(a.fans, b.fans) ||
      compareAscNullLast(a.listeners, b.listeners) ||
      b.plays - a.plays ||
      compareName(a, b)
    );
  }
  return comparePlays(a, b, history);
}

function playsOf(model: Model, agg: ArtistAgg): number {
  let total = 0;
  for (const trackKey of agg.trackKeys) {
    const track = model.tracksByKey.get(trackKey);
    if (!track) continue;
    total += playsFor(model, track)?.plays ?? 0;
  }
  return total;
}

let rankedModel: Model | null = null;
let rankedSort: ReachSort | null = null;
let rankedRows: UnderRadarRow[] = [];

/**
 * One pass over `model.artists`, keeping only those with a Spotify id.
 * Memoised on the `Model` object identity and the sort, one entry: the model
 * changes only when loadFromDb rebuilds it, which is exactly when the ranking
 * must be recomputed, so a keystroke in the filter costs no re-sort.
 */
export function rankUnderTheRadar(
  model: Model,
  sort: ReachSort
): UnderRadarRow[] {
  if (rankedModel === model && rankedSort === sort) return rankedRows;
  const history = hasHistory(model);
  const rows: UnderRadarRow[] = [];
  for (const agg of model.artists) {
    if (agg.id === null) continue;
    const identity = model.identities.get(agg.id);
    const reach = reachFor(model, agg.id);
    const listeners = reach.listenbrainz?.value ?? null;
    const fans = reach.deezer?.value ?? null;
    // Checked first, so a famous artist lands in `known` whether or not a
    // reach number was ever fetched.
    const group: ReachGroup = isWellKnown(identity)
      ? 'known'
      : listeners !== null || fans !== null
        ? 'radar'
        : 'unknown';
    rows.push({
      agg,
      artistId: agg.id,
      group,
      rank: 0,
      tracks: agg.trackKeys.size,
      playlists: agg.playlistIds.size,
      plays: playsOf(model, agg),
      listeners,
      fans,
      views: reach.wikipedia?.value ?? null,
      sitelinks: identity?.sitelinks ?? null,
    });
  }
  rows.sort(
    (a, b) =>
      GROUP_ORDER[a.group] - GROUP_ORDER[b.group] ||
      compareBySort(a, b, sort, history)
  );
  // One numbering, running on across the group headings, so the text filter
  // never renumbers anything.
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });
  rankedModel = model;
  rankedSort = sort;
  rankedRows = rows;
  return rows;
}

let coverageModel: Model | null = null;
let coverageValue: ReachCoverage | null = null;

/**
 * What the store holds, over the candidates only — artists with a Spotify id
 * in the owner's playlists. The source counts overlap on purpose, so they can
 * add up to more than `covered`. Memoised on the model identity: Settings and
 * the Under the radar caption both read it on every render.
 */
export function reachCoverage(m: Model): ReachCoverage {
  if (coverageModel === m && coverageValue) return coverageValue;
  let artists = 0;
  let covered = 0;
  let resolved = 0;
  let listenbrainz = 0;
  let deezer = 0;
  let wikipedia = 0;
  let wellKnown = 0;
  for (const agg of m.artists) {
    if (agg.id === null) continue;
    artists += 1;
    const identity = m.identities.get(agg.id);
    if (identity && identity.mbid !== null) resolved += 1;
    if (
      identity &&
      (identity.wikiTitles.en !== null || identity.wikiTitles.fr !== null)
    )
      wikipedia += 1;
    if (isWellKnown(identity)) wellKnown += 1;
    const reach = reachFor(m, agg.id);
    if (reach.listenbrainz) listenbrainz += 1;
    if (reach.deezer) deezer += 1;
    if (reach.listenbrainz || reach.deezer || reach.wikipedia) covered += 1;
  }
  coverageModel = m;
  coverageValue = {
    artists,
    covered,
    resolved,
    listenbrainz,
    deezer,
    wikipedia,
    wellKnown,
  };
  return coverageValue;
}
