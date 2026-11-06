import { destinationOf, routeHref, type Route } from '../../router';
import { lastRouteInTab } from './Nav';

interface Tab {
  tab: 'top' | 'crate' | 'playlists' | 'artists';
  label: string;
  home: Route;
}

const TABS: Record<'listening' | 'library', Tab[]> = {
  listening: [
    { tab: 'top', label: 'Top', home: { name: 'top' } },
    { tab: 'crate', label: 'Crate', home: { name: 'crate' } },
  ],
  library: [
    { tab: 'playlists', label: 'Playlists', home: { name: 'playlists' } },
    { tab: 'artists', label: 'Artists', home: { name: 'artists' } },
  ],
};

const ROOTS: Route['name'][] = ['top', 'crate', 'playlists', 'artists'];

/**
 * Material 3 primary tabs inside Listening and Library (spec 003, FR-002).
 * Links, so each part keeps its address. Drawn only on a tab root: a detail
 * has the top bar's up arrow instead. The other tab reopens where the owner
 * last was in it (a Crate view, say); the current one leads to its root.
 */
export function ScreenTabs(p: { current: Route }) {
  const { destination, tab } = destinationOf(p.current);
  if (destination !== 'listening' && destination !== 'library') return null;
  if (!ROOTS.includes(p.current.name)) return null;
  return (
    <div class="screen-tabs" role="tablist" aria-label={destination}>
      {TABS[destination].map((t) => {
        const on = t.tab === tab;
        const target = on ? t.home : (lastRouteInTab.value[t.tab] ?? t.home);
        return (
          <a
            key={t.tab}
            role="tab"
            aria-selected={on}
            class={on ? 'screen-tab active' : 'screen-tab'}
            href={routeHref(target)}
          >
            {t.label}
          </a>
        );
      })}
    </div>
  );
}
