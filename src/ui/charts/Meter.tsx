import { meterBand } from './series';

/**
 * A 0–100% bar in its band colour (research D10): `band-high` from 65%,
 * `error` under 35%, `on-surface-variant` between, the thresholds of the
 * Finish rate rows. The percentage is written beside the bar, so the colour
 * is never the only reading.
 */
export function Meter({
  pct,
  label = 'Finished',
}: {
  /** 0–100; rounded and clamped for the drawing. */
  pct: number;
  label?: string;
}) {
  const value = Math.min(100, Math.max(0, Math.round(pct)));
  return (
    <div
      class={`meter meter-${meterBand(value)}`}
      role="img"
      aria-label={`${label}: ${value}%`}
    >
      <div class="meter-track">
        <div class="meter-fill" style={{ width: `${value}%` }} />
      </div>
      <span class="meter-value">{value}%</span>
    </div>
  );
}
