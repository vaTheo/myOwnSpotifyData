export function Empty(p: { what: string; href?: string; cta?: string }) {
  return (
    <div class="empty">
      <p>No {p.what} yet.</p>
      <a href={p.href ?? '#/settings'}>{p.cta ?? 'Sync in Settings'}</a>
    </div>
  );
}
