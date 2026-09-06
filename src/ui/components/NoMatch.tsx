/** The "nothing matched the filter" block Artists and Under the radar share. */
export function NoMatch(p: { query: string; onClear: () => void }) {
  return (
    <div class="empty">
      <p>No artists match "{p.query}".</p>
      <button type="button" onClick={p.onClear}>
        Clear filter
      </button>
    </div>
  );
}
