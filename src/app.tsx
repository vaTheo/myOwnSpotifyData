import { signal } from '@preact/signals';
import { auth } from './auth/browser';
import { visibleBanner } from './model/banner';
import { banner, dismissBanner } from './model/state';
import { parseRoute, visitEntry, type Route } from './router';
import { Settings } from './ui/Settings';
import { Connect } from './ui/Connect';
import { Artist } from './ui/Artist';
import { Artists } from './ui/Artists';
import { CrateHub } from './ui/crate/CrateHub';
import { CrateView } from './ui/crate/CrateView';
import { Import } from './ui/Import';
import { AppFrame } from './ui/layout/AppFrame';
import { rememberRoute } from './ui/layout/Nav';
import { Mix } from './ui/Mix';
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
  rememberRoute(route.value);
  addEventListener('hashchange', () => {
    route.value = parseRoute(location.hash);
    rememberRoute(route.value);
    // A new screen starts at the top. Back and forward keep the position
    // the browser has already restored for them.
    if (visitEntry(history)) scrollTo(0, 0);
  });
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
    case 'mix':
      return <Mix />;
  }
}

export function App() {
  const phase = bootPhase.value;
  if (phase === 'signin') return <Connect signingIn />;
  if (!auth.session.value) return <Connect />;
  const current = route.value;
  return (
    <AppFrame
      route={current}
      loading={phase === 'loading'}
      banner={visibleBanner(banner.value, current.name)}
      onCloseBanner={dismissBanner}
    >
      <Screen route={current} />
    </AppFrame>
  );
}
