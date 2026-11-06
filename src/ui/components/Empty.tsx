import { EmptyState } from './EmptyState';

/** "No playlists yet." with the one action that fixes it: a sync. */
export function Empty(p: { what: string }) {
  return (
    <EmptyState
      icon="sync"
      action={{ label: 'Sync in Settings', href: '#/settings' }}
    >
      <p>No {p.what} yet.</p>
    </EmptyState>
  );
}
