export function Empty(p: { what: string }) {
  return (
    <div class="empty">
      <p>No {p.what} yet.</p>
      <a href="#/settings">Sync in Settings</a>
    </div>
  );
}
