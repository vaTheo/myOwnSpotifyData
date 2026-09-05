import { signal } from '@preact/signals';
import { auth } from './auth/browser';
import { visibleBanner } from './model/banner';
import { banner, dismissBanner } from './model/state';
import { parseRoute, routeHref, visitEntry, type Route } from './router';
import { Banner } from './ui/components/Banner';
import { Settings } from './ui/Settings';
import { Connect } from './ui/Connect';
import { Artist } from './ui/Artist';
import { Artists } from './ui/Artists';
import { CrateHub } from './ui/crate/CrateHub';
import { CrateView } from './ui/crate/CrateView';
import { Import } from './ui/Import';
import { Playlist } from './ui/Playlist';
import { Playlists } from './ui/Playlists';
import { Top } from './ui/Top';

export const route = signal<Route>(parseRoute(location.hash));

/**
 * What boot is still doing. `main.tsx` is the only writer: it renders the
 * shell before it loads anything, so it sets the phase before the first
 * render and again as each step finishes.
 */
export const bootPhase = signal<'signin' | 'loading' | 'ready'>('loading');

export function installRouter(): void {
  // The entry the app booted on counts as visited, so a later back to it
  // restores its scroll position instead of jumping to the top.
  visitEntry(history);
  addEventListener('hashchange', () => {
    route.value = parseRoute(location.hash);
    // A new screen starts at the top. Back and forward keep the position
    // the browser has already restored for them.
    if (visitEntry(history)) scrollTo(0, 0);
  });
}

const TABS: { route: Route; label: string }[] = [
  { route: { name: 'crate' }, label: 'Crate' },
  { route: { name: 'top' }, label: 'Top' },
  { route: { name: 'playlists' }, label: 'Playlists' },
  { route: { name: 'artists' }, label: 'Artists' },
  { route: { name: 'settings' }, label: 'Settings' },
];

function tabOf(r: Route): Route['name'] {
  if (r.name === 'playlist') return 'playlists';
  if (r.name === 'artist') return 'artists';
  if (r.name === 'crateView') return 'crate';
  if (r.name === 'import') return 'settings';
  return r.name;
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'crate':
      return <CrateHub />;
    case 'crateView':
      return <CrateView view={route.view} period={route.period} />;
    case 'top':
      return <Top />;
    case 'playlists':
      return <Playlists />;
    case 'playlist':
      return <Playlist id={route.id} />;
    case 'artists':
      return <Artists />;
    case 'artist':
      return <Artist artistKey={route.key} />;
    case 'import':
      return <Import />;
    case 'settings':
      return <Settings />;
  }
}

export function App() {
  const phase = bootPhase.value;
  if (phase === 'signin') {
    return (
      <div class="connect">
        <h1>DJ Data</h1>
        <p class="muted">Signing you in…</p>
      </div>
    );
  }
  if (!auth.session.value) return <Connect />;
  const current = route.value;
  const message = visibleBanner(banner.value, current.name);
  return (
    <div class="app">
      {message && <Banner message={message} onClose={dismissBanner} />}
      <main class="screen">
        {phase === 'loading' ? (
          <div class="empty">
            <p>Loading your library…</p>
          </div>
        ) : (
          <Screen route={current} />
        )}
      </main>
      <nav class="tabs">
        {TABS.map((tab) => (
          <a
            key={tab.label}
            href={routeHref(tab.route)}
            class={tabOf(current) === tab.route.name ? 'tab active' : 'tab'}
          >
            {tab.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
