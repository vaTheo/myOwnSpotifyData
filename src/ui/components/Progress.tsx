export function Progress(p: {
  label: string;
  done: number;
  total: number;
  unit?: string;
}) {
  const unit = p.unit ?? 'playlists';
  return (
    <div class="progress">
      <div>{p.label}</div>
      {p.total > 0 && (
        <>
          <div class="progress-bar">
            <div
              style={{ width: `${Math.round((p.done / p.total) * 100)}%` }}
            />
          </div>
          <div class="muted">
            {p.done} / {p.total} {unit}
          </div>
        </>
      )}
    </div>
  );
}
