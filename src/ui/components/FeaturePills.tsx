import { featureFor } from '../../model/features';
import { camelotNumber, formatKey } from '../../model/keys';
import { keyNotation, model } from '../../model/state';
import { formatBpm } from '../format';

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
 */
export function FeaturePills({ trackId }: { trackId: string }) {
  const m = model.value;
  const feature = m ? featureFor(m, trackId) : null;
  if (!feature) return null;
  const { bpm, key, major } = feature;
  if (bpm === null && (key === null || major === null)) return null;
  return (
    <>
      {bpm !== null && <span class="pill bpm">{formatBpm(bpm)}</span>}
      {key !== null && major !== null && (
        <span class={keyClass(key, major)}>
          {formatKey(key, major, keyNotation.value)}
        </span>
      )}
    </>
  );
}
