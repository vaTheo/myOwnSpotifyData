import { signal } from '@preact/signals';
import { playlistRanking, type RankedTrack } from '../model/aggregate';
import { featureFor, type ResolvedFeature } from '../model/features';
import { camelotNumber, formatKey } from '../model/keys';
import { rankMatches, type MatchResult } from '../model/match';
import {
  isSyncBusy,
  keyNotation,
  model,
  startSync,
  syncState,
} from '../model/state';
import { Badge } from './components/Badge';
import { FeaturePills } from './components/FeaturePills';
import { PlaysBadge } from './components/PlaysBadge';
import { Segmented } from './components/Segmented';
import { SpotifyLink } from './components/SpotifyLink';
import { TrackRow } from './components/TrackRow';
import { PERIOD_LABEL, artistNames, formatBpm, plural } from './format';

const order = signal<'plays' | 'order' | 'match'>('plays');

/**
 * Spec §5: one seed per playlist, so walking from one playlist to another
 * with Match on asks for a new seed instead of ranking against a track that
 * is not in this list. Keyed by `TrackRow.key`, because a local file has no
 * Spotify id. Replaced whole, so the signal actually changes.
 */
const seeds = signal<Record<string, string>>({});

/**
 * Handed to `rankMatches` and used again for the badge rule, so the list and
 * the badges can never disagree about what "in tolerance" means. It is the
 * same 6% as the `tolerancePct` default in spec §2.
 */
const TOLERANCE_PCT = 6;

interface ListedRow {
  row: RankedTrack;
  match: MatchResult | null;
}

function setSeed(playlistId: string, trackKey: string): void {
  seeds.value = { ...seeds.value, [playlistId]: trackKey };
}

/** `Clear`, and leaving Match mode, drop every playlist's seed. */
function clearSeeds(): void {
  seeds.value = {};
}

/** '+1.6%', '−2.0%'; an exact tie reads '±0.0%' and not a signed zero. */
function deltaLabel(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±';
  return `${sign}${Math.abs(rounded).toFixed(1)}%`;
}

/** `Matching: Nightdrive · 126 BPM · 8A`; each part only when it is known. */
function seedCaption(name: string, f: ResolvedFeature | null): string {
  const parts = [`Matching: ${name}`];
  if (f && f.bpm !== null) parts.push(`${formatBpm(f.bpm)} BPM`);
  if (f && f.key !== null && f.major !== null) {
    parts.push(formatKey(f.key, f.major, keyNotation.value));
  }
  return parts.join(' · ');
}

/** 1..12, or null when the source gave a BPM but no key. */
function wheelNumber(f: ResolvedFeature): number | null {
  if (f.key === null || f.major === null) return null;
  return camelotNumber(f.key, f.major);
}

/**
 * `keyRelation` reports `adjacent`; which side of the wheel that is shows
 * only in the Camelot numbers, so the direction is decided here. 12A → 1A
 * counts as `+1`, the same wrap `keyRelation` itself applies.
 */
function relationLabel(
  seed: ResolvedFeature,
  feature: ResolvedFeature,
  relation: MatchResult['relation']
): string | null {
  if (relation === 'same') return 'same key';
  if (relation === 'relative') return 'relative';
  if (relation === 'boost') return 'boost';
  if (relation !== 'adjacent') return null;
  const from = wheelNumber(seed);
  const to = wheelNumber(feature);
  if (from === null || to === null) return null;
  return (from % 12) + 1 === to ? '+1' : '−1';
}

/**
 * Spec §5: relation then ΔBPM, and `no data` alone for a track no source
 * knows. A row out of tolerance keeps its ΔBPM and loses the relation; a row
 * with no ΔBPM at all keeps its relation and shows no percentage.
 */
function MatchBadges(p: {
  seed: ResolvedFeature | null;
  match: MatchResult | null;
}) {
  const { seed, match } = p;
  if (!seed || !match) return null;
  if (!match.feature) return <Badge>no data</Badge>;
  const far =
    match.deltaPct !== null && Math.abs(match.deltaPct) > TOLERANCE_PCT;
  const relation = far
    ? null
    : relationLabel(seed, match.feature, match.relation);
  return (
    <>
      {relation && <Badge kind="relation">{relation}</Badge>}
      {match.deltaPct !== null && <Badge>{deltaLabel(match.deltaPct)}</Badge>}
    </>
  );
}

export function Playlist({ id }: { id: string }) {
  const m = model.value;
  const playlist = m?.playlistsById.get(id);
  if (!m || !playlist) {
    return (
      <div class="empty">
        <p>Playlist not synced yet.</p>
        <a href="#/playlists">Back to playlists</a>
      </div>
    );
  }
  const ranked = playlistRanking(m, id);
  // Match ranks the plays order, so only `order` re-sorts by position.
  const rows =
    order.value === 'order'
      ? [...ranked].sort((a, b) => a.entry.position - b.entry.position)
      : ranked;
  const byKey = new Map(rows.map((r) => [r.track.key, r]));
  // Ranked by position, not by track key: a playlist may hold the same track
  // twice, and two candidates sharing an id would collapse the second row.
  const byPosition = new Map(rows.map((r) => [String(r.entry.position), r]));
  const matching = order.value === 'match';
  const seed = matching ? byKey.get(seeds.value[id]) : undefined;
  const seedFeature =
    seed && seed.track.id ? featureFor(m, seed.track.id) : null;
  const seedPosition = seed?.entry.position;
  const listed: ListedRow[] = seedFeature
    ? rankMatches(
        seedFeature,
        // Exclude only the seed's own position (not its track id): the
        // caption already names the seed as "Matching: …", so it must not
        // also rank as the top result of its own list. A track that
        // appears twice in the playlist keeps its other row.
        rows
          .filter((r) => r.entry.position !== seedPosition)
          .map((r) => ({
            id: String(r.entry.position),
            feature: r.track.id ? featureFor(m, r.track.id) : null,
          })),
        TOLERANCE_PCT
      ).flatMap((match) => {
        const row = byPosition.get(match.id);
        return row ? [{ row, match }] : [];
      })
    : rows.map((row) => ({ row, match: null }));
  const sync = syncState.value;
  const busy = isSyncBusy(sync);
  return (
    <section>
      <h1>{playlist.name}</h1>
      <p class="muted">
        {plural(ranked.length, 'track')} ·{' '}
        <SpotifyLink href={playlist.spotifyUrl} label />
      </p>
      <div class="actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => void startSync(id)}
        >
          {busy ? 'Syncing…' : 'Sync this playlist'}
        </button>
      </div>
      <Segmented
        options={[
          { value: 'plays', label: 'By plays' },
          { value: 'order', label: 'Playlist order' },
          { value: 'match', label: 'Match' },
        ]}
        value={order.value}
        onChange={(v) => {
          order.value = v;
          if (v !== 'match') clearSeeds();
        }}
      />
      {matching && !seed && <p class="caption">Tap a track to match against</p>}
      {matching && seed && (
        <>
          <p class="caption">{seedCaption(seed.track.name, seedFeature)}</p>
          {!seedFeature && (
            <p class="muted">No BPM or key for this track yet</p>
          )}
          <div class="actions">
            <button type="button" onClick={clearSeeds}>
              Clear
            </button>
          </div>
        </>
      )}
      <ul class="list">
        {listed.map(({ row: r, match }, i) => (
          <TrackRow
            key={r.entry.position}
            rank={i + 1}
            title={r.track.name}
            subtitle={artistNames(r.track.artists)}
            spotifyUrl={r.track.spotifyUrl}
            onClick={matching ? () => setSeed(id, r.track.key) : undefined}
            badges={
              <>
                <PlaysBadge plays={r.plays} />
                {r.inTop.map((p) => (
                  <Badge kind="top" key={p}>
                    Top {PERIOD_LABEL[p]}
                  </Badge>
                ))}
                <MatchBadges seed={seedFeature} match={match} />
                {r.track.id && <FeaturePills trackId={r.track.id} />}
              </>
            }
          />
        ))}
      </ul>
    </section>
  );
}
