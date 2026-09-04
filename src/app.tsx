import { signal } from '@preact/signals';
import { auth } from './auth/browser';
import { banner } from './model/state';
import { parseRoute, routeHref, type Route } from './router';
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

export function installRouter(): void {
  addEventListener('hashchange', () => {
    route.value = parseRoute(location.hash);
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
  if (!auth.session.value) return <Connect />;
  const current = route.value;
  return (
    <div class="app">
      {banner.value && (
        <Banner
          message={banner.value}
          onClose={() => {
            banner.value = null;
          }}
        />
      )}
      <main class="screen">
        <Screen route={current} />
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
