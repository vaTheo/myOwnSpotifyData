import type { MixRow } from '../../db/schema';
import { playsFor, type Model } from '../../model/aggregate';
import { normalize } from '../../model/normalize';
import { artistNames, plural } from '../format';

/**
 * The global search (spec 003, FR-051, data-model §9, research D11): an
 * index of what this browser already holds, nothing fetched.
 */
export type SearchKind = 'track' | 'artist' | 'playlist' | 'mix';

export interface SearchEntry {
  kind: SearchKind;
  /** Track id (or play row id), artist key, playlist id, mix url. */
  id: string;
  name: string;
  /** What the query is matched against: the name, and a track's artists. */
  normalized: string;
  context: string;
  /** Plays, tracks or saved date: the order among equal matches. */
  weight: number;
}

export interface SearchResult {
  kind: SearchKind;
  entries: SearchEntry[];
  total: number;
}

export const SEARCH_KINDS: readonly SearchKind[] = [
  'track',
  'artist',
  'playlist',
  'mix',
];

const SAVED_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
});

function withPlays(artist: string, plays: number | null): string {
  return plays ? `${artist} · ${plural(plays, 'play')}` : artist;
}

function build(model: Model, mixes: readonly MixRow[]): SearchEntry[] {
  const out: SearchEntry[] = [];
  const seen = new Set<string>();
  const add = (entry: Omit<SearchEntry, 'normalized'>, extra = '') => {
    const key = `${entry.kind}:${entry.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...entry, normalized: normalize(`${entry.name} ${extra}`) });
  };

  for (const track of model.tracksByKey.values()) {
    const artists = artistNames(track.artists);
    const plays = playsFor(model, track)?.plays ?? null;
    add(
      {
        kind: 'track',
        id: track.key,
        name: track.name,
        context: withPlays(artists, plays),
        weight: plays ?? 0,
      },
      artists
    );
  }
  // History-only tracks, by the names the export holds.
  for (const row of model.plays) {
    if (model.tracksByKey.has(row.trackId) || !row.trackName) continue;
    const artist = row.artistName ?? '';
    add(
      {
        kind: 'track',
        id: row.trackId,
        name: row.trackName,
        context: withPlays(artist || 'Unknown artist', row.plays),
        weight: row.plays,
      },
      artist
    );
  }

  for (const artist of model.artists) {
    add({
      kind: 'artist',
      id: artist.key,
      name: artist.name,
      context: plural(artist.trackKeys.size, 'saved track'),
      weight: artist.trackKeys.size,
    });
  }
  for (const row of model.topItems.values()) {
    if (row.type !== 'artists') continue;
    for (const item of row.items) {
      add({
        kind: 'artist',
        id: item.id,
        name: item.name,
        context: 'In your top artists',
        weight: 0,
      });
    }
  }

  for (const p of model.playlists) {
    add({
      kind: 'playlist',
      id: p.id,
      name: p.name,
      context: plural(p.itemCount, 'track'),
      weight: p.itemCount,
    });
  }

  for (const m of mixes) {
    add({
      kind: 'mix',
      id: m.url,
      name: m.title ?? m.url,
      context: `saved ${SAVED_DATE.format(m.savedAt)}`,
      weight: m.savedAt,
    });
  }
  return out;
}

let memo: {
  model: Model;
  mixes: readonly MixRow[];
  index: SearchEntry[];
} | null = null;

/**
 * Library tracks, history-only tracks, saved and top-list artists,
 * playlists and saved mixes, de-duplicated by id. Memoised on the model's
 * identity and the mixes array: a keystroke never rebuilds it.
 */
export function buildSearchIndex(
  model: Model,
  mixes: readonly MixRow[]
): SearchEntry[] {
  if (memo && memo.model === model && memo.mixes === mixes) return memo.index;
  const index = build(model, mixes);
  memo = { model, mixes, index };
  return index;
}

/** 0: the text starts with the query; 1: a word does; 2: elsewhere. */
function tier(normalized: string, query: string): number {
  if (normalized.startsWith(query)) return 0;
  return normalized.includes(` ${query}`) ? 1 : 2;
}

/**
 * The entries whose text holds `normalize(query)`, grouped Tracks, Artists,
 * Playlists, Mixes (empty groups left out). Within a group, prefix and
 * word-start matches come first, then the heavier, then by name.
 */
export function searchAll(
  index: readonly SearchEntry[],
  query: string,
  perGroup = 5
): SearchResult[] {
  const q = normalize(query);
  if (q === '') return [];
  const groups = new Map<SearchKind, { entry: SearchEntry; tier: number }[]>();
  for (const entry of index) {
    if (!entry.normalized.includes(q)) continue;
    const list = groups.get(entry.kind) ?? [];
    list.push({ entry, tier: tier(entry.normalized, q) });
    groups.set(entry.kind, list);
  }
  const out: SearchResult[] = [];
  for (const kind of SEARCH_KINDS) {
    const list = groups.get(kind);
    if (!list) continue;
    list.sort(
      (a, b) =>
        a.tier - b.tier ||
        b.entry.weight - a.entry.weight ||
        a.entry.name.localeCompare(b.entry.name)
    );
    out.push({
      kind,
      entries: list.slice(0, perGroup).map((m) => m.entry),
      total: list.length,
    });
  }
  return out;
}

/**
 * Where `normalize(query)` falls in `text` itself, as [start, end) indices
 * of the original string, for the result's bold part; null if it is not in
 * the text. Folds each character as `normalize` does (accents dropped,
 * lower case, anything else a single space) and remembers where it came from.
 */
export function highlight(
  text: string,
  query: string
): [number, number] | null {
  const q = normalize(query);
  if (q === '') return null;
  let folded = '';
  const from: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const base = text[i]
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .toLowerCase();
    for (const ch of base) {
      const out = /[\p{L}\p{N}]/u.test(ch) ? ch : ' ';
      if (out === ' ' && (folded === '' || folded.endsWith(' '))) continue;
      folded += out;
      from.push(i);
    }
  }
  const at = folded.indexOf(q);
  if (at === -1) return null;
  return [from[at], from[at + q.length - 1] + 1];
}

/**
 * Which line of a result carries the bold match: the name when the query
 * starts it or one of its words, else a context line that does (a track
 * found by its artist), else wherever it is found.
 */
export function markedLine(
  entry: Pick<SearchEntry, 'name' | 'context'>,
  query: string
): 'name' | 'context' | null {
  const q = normalize(query);
  if (q === '') return null;
  const name = normalize(entry.name);
  const context = normalize(entry.context);
  if (tier(name, q) < 2 && name.includes(q)) return 'name';
  if (tier(context, q) < 2 && context.includes(q)) return 'context';
  if (name.includes(q)) return 'name';
  return context.includes(q) ? 'context' : null;
}
