import { EmptyState } from './EmptyState';

/** The "nothing matched the filter" block Artists and Under the radar share. */
export function NoMatch(p: { query: string; onClear: () => void }) {
  return (
    <EmptyState
      icon="search"
      action={{ label: 'Clear filter', onClick: p.onClear }}
    >
      <p>No artists match "{p.query}".</p>
    </EmptyState>
  );
}
