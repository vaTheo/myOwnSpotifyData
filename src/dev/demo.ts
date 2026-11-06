/**
 * Demo data for the visual loop (spec 003, research D19, data-model §10).
 *
 * Dev only: `main.tsx` reaches this module through `demoVariant()`, which is
 * null in a production build, so none of it ships. Deterministic: the same
 * seed gives the same rows, so screenshots compare run to run. Nothing here
 * points at the network: covers are inline SVG `data:` URIs and the mixes
 * carry no player, so a shots run can block every request that leaves
 * 127.0.0.1.
 */
import type {
  AllRows,
  ArtistIdentityRow,
  ArtistRef,
  ArtistReachRow,
  EntryRow,
  FeatureRow,
  MixJobs,
  MixRow,
  Period,
  PlayRow,
  PlaylistRow,
  TopItemsRow,
  TrackRow,
  TracklistRow,
} from '../db/schema';
import { PERIODS, reachKey, topKey } from '../db/schema';
import { ARTIST_REACH_SUMMARY_META } from '../features/reachRun';
import { REKORDBOX_SUMMARY_META } from '../features/rekordboxImport';
import { HISTORY_SUMMARY_META } from '../history/importer';
import { emptyCounts } from '../history/records';
import { buildModel } from '../model/aggregate';
import { reachCoverage } from '../model/reach';
import { LAST_SYNC_META, SYNC_STATE_META } from '../sync/runner';
import { DEMO_NOW, type DemoVariant } from './flag';

export { DEMO_NOW };

export interface DemoData {
  rows: AllRows;
  mixes: MixRow[];
  mixJobs: MixJobs;
  /** `meta` store rows by name, written beside the stores. */
  metas: Record<string, unknown>;
}

const DAY = 86_400_000;
const PLAYLIST_COUNT = 40;
const TRACK_COUNT = 3000;
/** Artists with a Spotify id; the local file adds one more, by name. */
const ID_ARTIST_COUNT = 1199;
const PLAY_ROWS = 2000;
const HISTORY_ONLY_ROWS = 200;
const BIG_PLAYLIST = 500;

/** mulberry32: small, fast, and the same on every engine. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;

function int(rand: Rand, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

function pick<T>(rand: Rand, list: readonly T[]): T {
  return list[Math.floor(rand() * list.length)];
}

function shuffled<T>(rand: Rand, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** A Spotify-shaped id: 22 base62 characters, unique per prefix and n. */
function spotifyId(prefix: string, n: number): string {
  const r = prng(n * 7919 + prefix.charCodeAt(0) * 104729);
  let id = '';
  for (let i = 0; i < 22; i += 1) id += BASE62[Math.floor(r() * 62)];
  return id;
}

// prettier-ignore
const FIRST = [
  'Nova', 'Echo', 'Velvet', 'Lumen', 'Ori', 'Mira', 'Solar', 'Kaya', 'Dusk',
  'Atlas', 'Juno', 'Rhea', 'Cobalt', 'Indigo', 'Lior', 'Neon', 'Sable',
  'Tamsin', 'Vero', 'Zephyr', 'Amaru', 'Bastian', 'Cleo', 'Darian', 'Elio',
  'Faye', 'Galen', 'Hollis', 'Isak', 'Jalen',
];
// prettier-ignore
const SECOND = [
  'Kite', 'Okafor', 'Drift', 'Haze', 'Moreau', 'Lindqvist', 'Rivers',
  'Nakamura', 'Bloom', 'Vale', 'Harbor', 'Castell', 'Fjord', 'Prism', 'Weller',
  'Santos', 'Arden', 'Quill', 'Rook', 'Sorrel', 'Tide', 'Umber', 'Wren',
  'Yates', 'Zorn', 'Baptiste', 'Corvin', 'Delacroix', 'Ember', 'Falk',
];
// prettier-ignore
const GROUP = [
  'Collective', 'Ensemble', 'Sound System', 'Trio', 'Orchestra', 'Unit',
  'Society', 'Club', 'Machines', 'Brothers',
];
// prettier-ignore
const WORDS = [
  'Night', 'Drive', 'Signal', 'Velvet', 'Static', 'Horizon', 'Pulse', 'Echo',
  'Glass', 'Tide', 'Ember', 'Orbit', 'Mirage', 'Circuit', 'Dawn', 'Lantern',
  'Fever', 'Satellite', 'Paper', 'Moon', 'Hollow', 'Gravity', 'Sugar', 'Neon',
  'Shadow', 'Rain', 'Fire', 'Silk', 'Wave', 'Garden',
];
// prettier-ignore
const VERSIONS = [
  '', '', '', ' (Extended Mix)', ' - Original Mix', ' (Dub)', ' (Edit)',
];
// prettier-ignore
const PLAYLIST_NAMES = [
  'Peak Time Techno',
  'Warm-up Deep House',
  'Closing Hour',
  'Melodic Sunrise',
  'Afterhours 4AM',
  'Breaks & Bass',
  'Disco Edits',
  'Minimal Tuesdays',
  'Organic House',
  'Progressive Journeys',
  'Acid Lines',
  'Italo Night',
  'Balearic Sunset',
  'Everything I played at the summer open-air series in the old harbour warehouse, 2025 edition (tracks to keep)',
  'Garage Classics',
  'Electro Shocks',
  'Downtempo Drive',
  'Hard Groove',
  'Afro House Heat',
  'Jazz Breaks',
  'Funk Fridays',
  'Ambient Mornings',
  'Big Room Tools',
  'Vocal House',
  'Dub Techno',
  'New Beat Revival',
  'Leftfield Picks',
  'Rollers',
  'B2B Prep',
  'Wedding Safe',
  'Radio Show 112',
  'Radio Show 113',
  'Promo Inbox',
  'To Listen',
  'Bandcamp Friday',
  'Records Bought 2024',
  'Records Bought 2025',
  'Old School Trance',
  'Latin Grooves',
  'Sunday Session',
];

function artistName(i: number): string {
  if (i < 900) return `${FIRST[i % 30]} ${SECOND[Math.floor(i / 30) % 30]}`;
  const j = i - 900;
  return `${SECOND[j % 30]} ${GROUP[Math.floor(j / 30) % GROUP.length]}`;
}

/** An inline SVG square: the hue from the text, its two initials on top. */
function cover(text: string): string {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 360;
  const initials = text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" fill="hsl(${h},45%,32%)"/>` +
    `<text x="32" y="40" font-family="sans-serif" font-size="22" ` +
    `text-anchor="middle" fill="hsl(${h},70%,85%)">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString();
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Every month key from Nov 2020 to Nov 2026, oldest first (73 keys). */
function allMonths(): string[] {
  const keys: string[] = [];
  for (let y = 2020, m = 11; y < 2026 || (y === 2026 && m <= 11);) {
    keys.push(monthKey(y, m));
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

interface Built {
  artists: ArtistRef[];
  localArtist: ArtistRef;
  tracks: TrackRow[];
  playlists: PlaylistRow[];
  entries: EntryRow[];
}

function buildLibrary(rand: Rand): Built {
  const artists: ArtistRef[] = [];
  for (let i = 0; i < ID_ARTIST_COUNT; i += 1) {
    artists.push({ id: spotifyId('a', i), name: artistName(i) });
  }
  const localArtist: ArtistRef = { id: null, name: 'Unknown Bootleg Artist' };
  const tracks: TrackRow[] = [];
  for (let n = 0; n < TRACK_COUNT; n += 1) {
    if (n === 1) {
      const title = 'Untitled Bootleg (Live Recording)';
      tracks.push({
        key: `spotify:local:Unknown+Bootleg+Artist:Bootlegs:Untitled+Bootleg:412`,
        id: null,
        uri: 'spotify:local:Unknown+Bootleg+Artist:Bootlegs:Untitled+Bootleg:412',
        name: title,
        artists: [localArtist],
        album: 'Bootlegs',
        durationMs: 412_000,
        isrc: null,
        spotifyUrl: null,
        isLocal: true,
      });
      continue;
    }
    const lead = artists[n % ID_ARTIST_COUNT];
    const credits: ArtistRef[] = [lead];
    if (rand() < 0.15) {
      const other = pick(rand, artists);
      if (other.id !== lead.id) credits.push(other);
    }
    const base = `${pick(rand, WORDS)} ${pick(rand, WORDS)}`;
    let name = `${base}${pick(rand, VERSIONS)}`;
    if (n === 0) {
      // The 120-character edge case: a real-world remix credit run long.
      name =
        'Night Drive Through the Harbour Lights (Extended Club Mix with Strings, Live Percussion and the Unreleased Acapella Dub)';
    }
    const id = spotifyId('t', n);
    tracks.push({
      key: id,
      id,
      uri: `spotify:track:${id}`,
      name,
      artists: credits,
      album: `${pick(rand, WORDS)} ${pick(rand, ['EP', 'LP', 'Remixes', 'Vol. 2'])}`,
      durationMs: int(rand, 180, 480) * 1000,
      isrc: `QZDA${String(20 + (n % 7)).padStart(2, '0')}${String(n).padStart(5, '0')}`,
      spotifyUrl: `https://open.spotify.com/track/${id}`,
      isLocal: false,
    });
  }

  const playlists: PlaylistRow[] = [];
  const entries: EntryRow[] = [];
  const syncedAt = DEMO_NOW - 2 * DAY;
  const perList = Math.ceil(
    (TRACK_COUNT - BIG_PLAYLIST) / (PLAYLIST_COUNT - 1)
  );
  for (let p = 0; p < PLAYLIST_COUNT; p += 1) {
    const id = spotifyId('p', p);
    const name = PLAYLIST_NAMES[p];
    let members: number[];
    if (p === 0) {
      members = Array.from({ length: BIG_PLAYLIST }, (_, i) => i);
    } else {
      const start = BIG_PLAYLIST + (p - 1) * perList;
      const end = Math.min(TRACK_COUNT, start + perList);
      members = Array.from({ length: end - start }, (_, i) => start + i);
      const extra = int(rand, 0, 30);
      for (let k = 0; k < extra; k += 1)
        members.push(int(rand, 2, TRACK_COUNT - 1));
      // A playlist that holds the same track twice: rows key on position.
      if (p === 1) members.push(members[0]);
      members = shuffled(rand, members);
    }
    if (p === 0) members = [0, 1, ...shuffled(rand, members.slice(2))];
    members.forEach((t, position) => {
      entries.push({
        playlistId: id,
        position,
        trackKey: tracks[t].key,
        addedAt: tracks[t].isLocal
          ? null
          : isoDay(Date.UTC(2019, 0, 1) + int(rand, 0, 2860) * DAY),
      });
    });
    playlists.push({
      id,
      name,
      snapshotId: `snap${p}`,
      itemCount: members.length,
      imageUrl: p % 9 === 4 ? null : cover(name),
      spotifyUrl: `https://open.spotify.com/playlist/${id}`,
      syncedAt: syncedAt - p * 3_600_000,
    });
  }
  return { artists, localArtist, tracks, playlists, entries };
}

type Profile = 'rotation' | 'gem' | 'classic' | 'casual';

function spreadMonths(
  rand: Rand,
  keys: string[],
  total: number
): Record<string, number> {
  const months: Record<string, number> = {};
  for (let i = 0; i < total; i += 1) {
    const key = pick(rand, keys);
    months[key] = (months[key] ?? 0) + 1;
  }
  return months;
}

function monthsFor(
  rand: Rand,
  profile: Profile,
  months: string[]
): Record<string, number> {
  const last = months.length - 1;
  switch (profile) {
    case 'rotation': {
      // The last one to six months, the current one included.
      const span = int(rand, 1, 6);
      const total = int(rand, 6, 80);
      const recent = months.slice(last - span + 1);
      const result = spreadMonths(rand, recent, total);
      // A third also had a little older history, so not every one is New.
      if (rand() < 0.66) {
        const older = months.slice(0, last - span);
        Object.assign(
          result,
          spreadMonths(rand, [pick(rand, older)], int(rand, 1, 6))
        );
      }
      return result;
    }
    case 'gem': {
      // Heavy once, silent for 13 months or more since.
      const end = int(rand, 6, last - 13);
      const start = Math.max(0, end - int(rand, 2, 10));
      return spreadMonths(
        rand,
        months.slice(start, end + 1),
        int(rand, 12, 150)
      );
    }
    case 'classic': {
      // A few plays in each of three to six years.
      const years = shuffled(rand, [2021, 2022, 2023, 2024, 2025, 2026]).slice(
        0,
        int(rand, 3, 6)
      );
      const result: Record<string, number> = {};
      for (const year of years) {
        const inYear = months.filter((k) => k.startsWith(`${year}-`));
        Object.assign(result, spreadMonths(rand, inYear, int(rand, 3, 12)));
      }
      return result;
    }
    case 'casual':
      return spreadMonths(rand, months, int(rand, 1, 8));
  }
}

function buildPlays(
  rand: Rand,
  lib: Built
): { plays: PlayRow[]; range: { first: string; last: string } } {
  const months = allMonths();
  const withId = lib.tracks.filter((t) => t.id !== null);
  const chosen = shuffled(rand, withId).slice(0, PLAY_ROWS - HISTORY_ONLY_ROWS);
  const sources: { id: string; name: string; artist: string; ms: number }[] = [
    ...chosen.map((t) => ({
      id: t.id as string,
      name: t.name,
      artist: t.artists[0].name,
      ms: t.durationMs,
    })),
    ...Array.from({ length: HISTORY_ONLY_ROWS }, (_, i) => ({
      id: spotifyId('h', i),
      name: `${pick(rand, WORDS)} ${pick(rand, WORDS)}`,
      artist: `${pick(rand, FIRST)} ${pick(rand, GROUP)}`,
      ms: int(rand, 180, 420) * 1000,
    })),
  ];
  const plays: PlayRow[] = [];
  let first = '9999';
  let last = '0000';
  sources.forEach((s, i) => {
    // The first row reaches back to Nov 2020 so the history spans six years.
    const roll = rand();
    const profile: Profile =
      i === 0
        ? 'classic'
        : roll < 0.25
          ? 'rotation'
          : roll < 0.5
            ? 'gem'
            : roll < 0.7
              ? 'classic'
              : 'casual';
    const m = monthsFor(rand, profile, months);
    if (i === 0) m[months[0]] = (m[months[0]] ?? 0) + 2;
    const keys = Object.keys(m).sort();
    const total = Object.values(m).reduce((a, b) => a + b, 0);
    const firstTs = `${keys[0]}-${String(int(rand, 2, 26)).padStart(2, '0')}T20:15:00Z`;
    const lastKey = keys[keys.length - 1];
    const lastDay = lastKey === '2026-11' ? int(rand, 1, 5) : int(rand, 2, 27);
    const lastTs = `${lastKey}-${String(lastDay).padStart(2, '0')}T23:40:00Z`;
    if (firstTs < first) first = firstTs;
    if (lastTs > last) last = lastTs;
    const attempts = total + Math.round(total * rand() * 0.6);
    const finished = Math.min(
      attempts,
      Math.round(total * (0.15 + rand() * 0.8))
    );
    const skipped = Math.round((attempts - finished) * (0.5 + rand() * 0.4));
    plays.push({
      trackId: s.id,
      plays: total,
      msPlayed: Math.round(total * s.ms * (0.6 + rand() * 0.4)),
      firstTs,
      lastTs,
      trackName: s.name,
      artistName: s.artist,
      months: m,
      attempts,
      finished,
      skipped,
    });
  });
  return { plays, range: { first, last } };
}

function buildFeatures(rand: Rand, lib: Built): FeatureRow[] {
  const withId = lib.tracks.filter((t) => t.id !== null);
  const order = shuffled(rand, withId);
  const valued = Math.round(withId.length * 0.7);
  const rows: FeatureRow[] = [];
  order.forEach((t, i) => {
    const fetchedAt = DEMO_NOW - int(rand, 3, 60) * DAY;
    const id = t.id as string;
    if (i < valued) {
      const bpm =
        Math.round((118 + rand() * 18 + (rand() < 0.1 ? 40 : 0)) * 10) / 10;
      const key = int(rand, 0, 11);
      const major = rand() < 0.4;
      if (i === 0 || i % 5 === 0) {
        // Rekordbox: whole BPMs and, for the first one, no key at all.
        const noKey = i === 0;
        rows.push({
          trackId: id,
          isrc: t.isrc,
          rekordbox: {
            bpm: Math.round(bpm),
            key: noKey ? null : key,
            major: noKey ? null : major,
            energy: null,
            fetchedAt,
            matchedBy: 'title-artist-duration',
            rbTitle: t.name,
            rbArtist: t.artists[0].name,
          },
          updatedAt: fetchedAt,
        });
      } else {
        rows.push({
          trackId: id,
          isrc: t.isrc,
          reccobeats: {
            bpm,
            key,
            major,
            energy: Math.round(rand() * 100) / 100,
            fetchedAt,
          },
          updatedAt: fetchedAt,
        });
      }
    } else if (i < valued + Math.round(withId.length * 0.1)) {
      rows.push({
        trackId: id,
        isrc: t.isrc,
        reccobeats: { notFound: true, checkedAt: fetchedAt },
        updatedAt: fetchedAt,
      });
    }
  });
  return rows;
}

function buildReach(
  rand: Rand,
  lib: Built
): { identities: ArtistIdentityRow[]; reach: ArtistReachRow[] } {
  const order = shuffled(rand, lib.artists);
  const covered = Math.round(order.length * 0.8);
  const identities: ArtistIdentityRow[] = [];
  const reach: ArtistReachRow[] = [];
  order.slice(0, covered).forEach((a, i) => {
    const artistId = a.id as string;
    const fetchedAt = DEMO_NOW - int(rand, 4, 20) * DAY;
    const wellKnown = i % 8 === 0;
    const sitelinks = wellKnown ? int(rand, 3, 80) : 0;
    const mbid =
      rand() < 0.92
        ? `0000${i.toString(16).padStart(4, '0')}-demo-4000-8000-${artistId.slice(0, 12).toLowerCase()}`
        : null;
    const deezerId = rand() < 0.88 ? 100000 + i : null;
    const title = a.name.replace(/ /g, '_');
    identities.push({
      artistId,
      name: a.name,
      mbid,
      mbidStatus: mbid ? 'ok' : 'notFound',
      qid: wellKnown ? `Q${900000 + i}` : null,
      qidStatus: wellKnown ? 'ok' : 'notFound',
      qidCheckedAt: fetchedAt,
      sitelinks,
      wikiTitles: wellKnown
        ? { en: title, fr: rand() < 0.5 ? title : null }
        : { en: null, fr: null },
      deezerArtistId: deezerId,
      deezerName: deezerId ? a.name : null,
      deezerStatus: deezerId ? 'ok' : 'notFound',
      resolvedAt: fetchedAt,
      retryAfter: null,
    });
    // Small audiences mostly: Under the radar needs a long tail.
    const scale = wellKnown ? 200_000 : rand() < 0.7 ? 2_000 : 40_000;
    reach.push({
      key: reachKey(artistId, 'listenbrainz'),
      artistId,
      source: 'listenbrainz',
      status: mbid ? 'ok' : 'notFound',
      value: mbid ? Math.round(rand() * scale) + 3 : null,
      ...(mbid
        ? { extra: { listens: Math.round(rand() * scale * 9) + 10 } }
        : {}),
      fetchedAt,
      retryAfter: null,
      sourceUrl: mbid ? `https://listenbrainz.org/artist/${mbid}/` : '',
    });
    reach.push({
      key: reachKey(artistId, 'deezer'),
      artistId,
      source: 'deezer',
      status: deezerId ? 'ok' : 'notFound',
      value: deezerId ? Math.round(rand() * scale * 1.5) + 1 : null,
      fetchedAt,
      retryAfter: null,
      sourceUrl: deezerId ? `https://www.deezer.com/artist/${deezerId}` : '',
    });
    if (wellKnown) {
      const en = int(rand, 500, 90_000);
      reach.push({
        key: reachKey(artistId, 'wikipedia'),
        artistId,
        source: 'wikipedia',
        status: 'ok',
        value: en,
        extra: { en, months: 12 },
        fetchedAt,
        retryAfter: null,
        sourceUrl: `https://en.wikipedia.org/wiki/${title}`,
      });
    }
  });
  return { identities, reach };
}

function buildTop(rand: Rand, lib: Built, plays: PlayRow[]): TopItemsRow[] {
  const byId = new Map(lib.tracks.map((t) => [t.id, t]));
  const ranked = [...plays]
    .filter((p) => byId.has(p.trackId))
    .sort((a, b) => b.plays - a.plays);
  const rows: TopItemsRow[] = [];
  PERIODS.forEach((period: Period, pi) => {
    const pool = shuffled(rand, ranked.slice(0, 120 + pi * 60)).slice(0, 50);
    rows.push({
      key: topKey('tracks', period),
      period,
      fetchedAt: DEMO_NOW - 2 * DAY,
      type: 'tracks',
      items: pool.map((p, i) => {
        const t = byId.get(p.trackId) as TrackRow;
        return {
          rank: i + 1,
          id: t.id as string,
          name: t.name,
          artists: t.artists,
          album: t.album,
          imageUrl: cover(t.album),
          spotifyUrl: t.spotifyUrl,
        };
      }),
    });
    rows.push({
      key: topKey('artists', period),
      period,
      fetchedAt: DEMO_NOW - 2 * DAY,
      type: 'artists',
      items: shuffled(rand, lib.artists)
        .slice(0, 50)
        .map((a, i) => ({
          rank: i + 1,
          id: a.id as string,
          name: a.name,
          imageUrl: cover(a.name),
          spotifyUrl: `https://open.spotify.com/artist/${a.id}`,
        })),
    });
  });
  return rows;
}

function tracklistRow(
  partial: Partial<TracklistRow> & Pick<TracklistRow, 'artist' | 'title'>
): TracklistRow {
  return {
    startSec: null,
    endSec: null,
    label: null,
    source: 'trackid',
    gap: false,
    detected: null,
    referenceCount: null,
    ...partial,
  };
}

function buildMixes(
  rand: Rand,
  lib: Built
): { mixes: MixRow[]; mixJobs: MixJobs } {
  const known = shuffled(
    rand,
    lib.tracks.filter((t) => !t.isLocal)
  ).slice(0, 30);
  const first: TracklistRow[] = [];
  let at = 0;
  for (let i = 0; i < 24; i += 1) {
    if (i === 9) {
      first.push(
        tracklistRow({ artist: '', title: '', gap: true, startSec: at })
      );
      at += int(rand, 150, 300);
      continue;
    }
    const t = known[i];
    const fromLibrary = i % 3 !== 2;
    first.push(
      tracklistRow({
        startSec: at,
        artist: fromLibrary
          ? t.artists[0].name
          : `${pick(rand, FIRST)} ${pick(rand, SECOND)}`,
        title: fromLibrary
          ? t.name
          : `${pick(rand, WORDS)} ${pick(rand, WORDS)}`,
        label: rand() < 0.6 ? `${pick(rand, WORDS)} Records` : null,
        source: i < 16 ? 'trackid' : 'description',
        referenceCount: i < 16 ? int(rand, 0, 40) : null,
      })
    );
    at += int(rand, 180, 360);
  }
  const second: TracklistRow[] = [];
  at = 0;
  for (let i = 0; i < 18; i += 1) {
    const t = known[12 + i];
    second.push(
      tracklistRow({
        startSec: at,
        endSec: at + 12,
        artist: t.artists[0].name,
        title: t.name,
        source: 'tracklistify',
        confidence: int(rand, 55, 99),
        isrc: t.isrc,
        shazamUrl: null,
      })
    );
    at += int(rand, 200, 380);
  }
  const playlistId = spotifyId('m', 1);
  const mixes: MixRow[] = [
    {
      url: 'https://soundcloud.com/demo-dj/peak-time-set-at-the-harbour',
      title: 'Peak time set at the Harbour',
      author: 'Demo DJ',
      playerSrc: null,
      slug: 'demo-dj/peak-time-set-at-the-harbour',
      sources: {
        trackid: true,
        description: true,
        pasted: false,
        linkOut: null,
      },
      rows: first,
      playlistUrl: `https://open.spotify.com/playlist/${playlistId}`,
      playlistId,
      savedAt: DEMO_NOW - 3 * DAY,
    },
    {
      url: 'https://www.youtube.com/watch?v=demoSet0001',
      title: 'Sunrise closing set (scanned on my computer)',
      author: 'Another DJ',
      playerSrc: null,
      slug: null,
      sources: {
        trackid: false,
        description: false,
        pasted: false,
        linkOut: null,
        tracklistify: true,
        worker: true,
      },
      rows: second,
      identifyJobId: 'demo-job-done',
      identifiedAt: DEMO_NOW - DAY,
      savedAt: DEMO_NOW - DAY,
    },
  ];
  const created = (days: number) => DEMO_NOW - days * DAY;
  const mixJobs: MixJobs = {
    'https://www.youtube.com/watch?v=demoSet0001': [
      {
        id: 'demo-job-done',
        status: 'done',
        createdAt: created(2),
        claimedBy: 'studio-pc',
        claimedAt: created(2) + 60_000,
        finishedAt: created(1),
        error: null,
        appliedAt: created(1) + 5_000,
      },
      {
        id: 'demo-job-rejected',
        status: 'done',
        createdAt: created(5),
        claimedBy: 'studio-pc',
        claimedAt: created(5) + 60_000,
        finishedAt: created(5) + 900_000,
        error: null,
        appliedAt: null,
        rejected: true,
      },
    ],
    'https://soundcloud.com/demo-dj/warehouse-b2b-all-night': [
      {
        id: 'demo-job-queued',
        status: 'queued',
        createdAt: DEMO_NOW - 3_600_000,
        claimedBy: null,
        claimedAt: null,
        finishedAt: null,
        error: null,
        appliedAt: null,
      },
      {
        id: 'demo-job-claimed',
        status: 'claimed',
        createdAt: DEMO_NOW - 7_200_000,
        claimedBy: 'studio-pc',
        claimedAt: DEMO_NOW - 600_000,
        finishedAt: null,
        error: null,
        appliedAt: null,
      },
      {
        id: 'demo-job-failed',
        status: 'failed',
        createdAt: created(3),
        claimedBy: 'studio-pc',
        claimedAt: created(3) + 60_000,
        finishedAt: created(3) + 300_000,
        error: 'Shazam refused the probes (HTTP 429). Try again later.',
        appliedAt: null,
      },
    ],
  };
  return { mixes, mixJobs };
}

const EMPTY_ROWS: AllRows = {
  playlists: [],
  tracks: [],
  entries: [],
  topItems: [],
  plays: [],
  features: [],
  artistIdentity: [],
  artistReach: [],
};

export function buildDemo(variant: DemoVariant, seed = 1): DemoData {
  if (variant === 'empty' || variant === 'signed-out') {
    return { rows: { ...EMPTY_ROWS }, mixes: [], mixJobs: {}, metas: {} };
  }
  const rand = prng(seed);
  const lib = buildLibrary(rand);
  const { plays, range } = buildPlays(rand, lib);
  const features = buildFeatures(rand, lib);
  const noReach = variant === 'no-reach';
  const { identities, reach } = noReach
    ? { identities: [], reach: [] }
    : buildReach(rand, lib);
  const topItems = buildTop(rand, lib, plays);
  const { mixes, mixJobs } = buildMixes(rand, lib);

  const oldImport = variant === 'old-import';
  const storedPlays: PlayRow[] = oldImport
    ? plays.map((p) => ({
        trackId: p.trackId,
        plays: p.plays,
        msPlayed: p.msPlayed,
        firstTs: p.firstTs,
        lastTs: p.lastTs,
        trackName: p.trackName,
        artistName: p.artistName,
      }))
    : plays;
  const rows: AllRows = {
    playlists: lib.playlists,
    tracks: lib.tracks,
    entries: lib.entries,
    topItems,
    plays: storedPlays,
    features,
    artistIdentity: identities,
    artistReach: reach,
  };

  const total = plays.reduce((sum, p) => sum + p.plays, 0);
  const counts = emptyCounts();
  counts.credited = total;
  counts.short = Math.round(total * 0.18);
  counts.podcast = 41;
  const historySummary = {
    ...(oldImport ? {} : { version: 2 as const }),
    importedAt: DEMO_NOW - DAY,
    plays: total,
    tracks: plays.length,
    matchedTracks: PLAY_ROWS - HISTORY_ONLY_ROWS,
    counts,
    outcomes: {
      attempts: plays.reduce((s, p) => s + (p.attempts ?? 0), 0),
      finished: plays.reduce((s, p) => s + (p.finished ?? 0), 0),
      skipped: plays.reduce((s, p) => s + (p.skipped ?? 0), 0),
    },
    zone: 'Europe/Paris',
    range,
    processed: [
      'Streaming_History_Audio_2020-2022_0.json',
      'Streaming_History_Audio_2022-2024_1.json',
      'Streaming_History_Audio_2024-2026_2.json',
    ],
    skipped: [],
  };
  const withKey = features.filter(
    (f) => f.rekordbox && f.rekordbox.key !== null
  ).length;
  const metas: Record<string, unknown> = {
    [HISTORY_SUMMARY_META]: historySummary,
    [REKORDBOX_SUMMARY_META]: {
      importedAt: DEMO_NOW - 10 * DAY,
      parsed: 812,
      withBpm: features.filter((f) => f.rekordbox).length,
      withKey,
      matched: features.filter((f) => f.rekordbox).length,
      unmatched: 214,
    },
    [LAST_SYNC_META]: DEMO_NOW - 2 * DAY,
  };
  if (!noReach) {
    metas[ARTIST_REACH_SUMMARY_META] = {
      ...reachCoverage(buildModel(rows)),
      version: 1,
      ranAt: DEMO_NOW - 4 * DAY,
      paused: [],
    };
  }
  if (variant === 'locked') {
    metas[SYNC_STATE_META] = {
      status: 'locked',
      retryAt: DEMO_NOW + 3 * 3_600_000,
      pending: lib.playlists.slice(37).map((p) => p.id),
      done: 37,
      total: PLAYLIST_COUNT,
    };
  }
  return { rows, mixes, mixJobs, metas };
}
