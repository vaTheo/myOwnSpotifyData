import { camelotNumber, formatKey } from '../../model/keys';
import { keyNotation } from '../../model/state';
import { formatBpm } from '../format';

/**
 * A key in the owner's notation, in its Camelot hue (spec 003): the hue from
 * the Camelot number, filled for minor and outlined for major, as before the
 * redesign. The text always says the key, so the colour is never alone.
 */
export function KeyPill(p: { musicalKey: number; major: boolean }) {
  const n = camelotNumber(p.musicalKey, p.major);
  return (
    <span class={`pill key-${n} ${p.major ? 'major' : 'minor'}`}>
      {formatKey(p.musicalKey, p.major, keyNotation.value)}
    </span>
  );
}

/** A BPM as tabular figures, the way every number column shows it. */
export function BpmText(p: { bpm: number }) {
  return <span class="pill bpm">{formatBpm(p.bpm)}</span>;
}
