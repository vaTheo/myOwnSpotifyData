import { featureFor } from '../../model/features';
import { camelotNumber, formatKey } from '../../model/keys';
import { keyNotation, model } from '../../model/state';
import { formatBpm } from '../format';
import { trackYear, YearPill } from './YearView';

/** `pill key-8 minor`: the Camelot number picks the hue, the mode the fill. */
function keyClass(key: number, major: boolean): string {
  return `pill key-${camelotNumber(key, major)} ${major ? 'major' : 'minor'}`;
}

/**
 * Spec §5: up to two pills after a row's badges, and nothing at all when
 * the track has no resolved feature. `bpm`, `key` and `major` are
 * independently nullable — Rekordbox often has a BPM and no key — so each
 * pill is decided on its own; the key pill needs both `key` and `major`,
 * because a Camelot code is meaningless without the mode.
 *
 * Round 005: the release year rides after them (`yearOf`, cached by `trackYear`), absent on an
 * undated track. The Mix screen passes `year={false}`: a mix row shows its
 * own year, the one its year sort uses.
 */
export function FeaturePills({
  trackId,
  year = true,
}: {
  trackId: string;
  year?: boolean;
}) {
  const m = model.value;
  if (!m) return null;
  const feature = featureFor(m, trackId);
  const released = year ? trackYear(m, trackId) : null;
  const bpm = feature?.bpm ?? null;
  const key = feature?.key ?? null;
  const major = feature?.major ?? null;
  return (
    <>
      {bpm !== null && <span class="pill bpm">{formatBpm(bpm)}</span>}
      {key !== null && major !== null && (
        <span class={keyClass(key, major)}>
          {formatKey(key, major, keyNotation.value)}
        </span>
      )}
      <YearPill year={released} />
    </>
  );
}
