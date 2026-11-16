import { msg } from '../../i18n';
import { EmptyState } from './EmptyState';

/** What is empty: each a whole sentence of the catalogue (spec 031). */
export type EmptyWhat = 'playlists' | 'top lists' | 'artists';

function sentence(what: EmptyWhat): string {
  const t = msg().frame.empty;
  if (what === 'playlists') return t.playlists;
  if (what === 'top lists') return t.topLists;
  return t.artists;
}

/** "No playlists yet." with the one action that fixes it: a sync. */
export function Empty(p: { what: EmptyWhat }) {
  return (
    <EmptyState
      icon="sync"
      action={{ label: msg().frame.empty.action, href: '#/settings' }}
    >
      <p>{sentence(p.what)}</p>
    </EmptyState>
  );
}
