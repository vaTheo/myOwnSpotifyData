/**
 * Material 3 linear progress (spec 003): what `Progress` was, with the same
 * props. Without a total it is indeterminate.
 */
export function ProgressBar(p: {
  label: string;
  done: number;
  total: number;
  unit?: string;
}) {
  const unit = p.unit ?? 'playlists';
  const known = p.total > 0;
  const pct = known ? Math.round((p.done / p.total) * 100) : 0;
  return (
    <div class="progress">
      <div class="progress-label">{p.label}</div>
      <div
        class={known ? 'progress-bar' : 'progress-bar indeterminate'}
        role="progressbar"
        aria-label={p.label}
        aria-valuemin={0}
        aria-valuemax={known ? p.total : undefined}
        aria-valuenow={known ? p.done : undefined}
      >
        <div style={known ? { width: `${pct}%` } : undefined} />
      </div>
      {known && (
        <div class="progress-count">
          {p.done} / {p.total} {unit}
        </div>
      )}
    </div>
  );
}
