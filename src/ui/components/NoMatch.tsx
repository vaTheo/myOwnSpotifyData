import { msg } from '../../i18n';
import { EmptyState } from './EmptyState';

/** The "nothing matched the filter" block Artists and Under the radar share. */
export function NoMatch(p: { query: string; onClear: () => void }) {
  return (
    <EmptyState
      icon="search"
      action={{ label: msg().frame.noMatch.clear, onClick: p.onClear }}
    >
      <p>{msg().frame.noMatch.artists(p.query)}</p>
    </EmptyState>
  );
}
