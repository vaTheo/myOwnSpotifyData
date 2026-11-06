import { featureFor } from '../../model/features';
import { model } from '../../model/state';
import { BpmText, KeyPill } from './KeyPill';

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
      {bpm !== null && <BpmText bpm={bpm} />}
      {key !== null && major !== null && (
        <KeyPill musicalKey={key} major={major} />
      )}
    </>
  );
}
