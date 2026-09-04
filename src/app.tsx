import { signal } from '@preact/signals';
import { auth } from './auth/browser';
import { banner } from './model/state';
import { parseRoute, routeHref, type Route } from './router';
import { Banner } from './ui/components/Banner';
import { Settings } from './ui/Settings';
import { Connect } from './ui/Connect';

export const route = signal<Route>(parseRoute(location.hash));

export function installRouter(): void {
  addEventListener('hashchange', () => {
    route.value = parseRoute(location.hash);
  });
}

const TABS: { route: Route; label: string }[] = [
  { route: { name: 'top' }, label: 'Top' },
  { route: { name: 'playlists' }, label: 'Playlists' },
  { route: { name: 'artists' }, label: 'Artists' },
  { route: { name: 'import' }, label: 'Import' },
  { route: { name: 'settings' }, label: 'Settings' },
];

function tabOf(r: Route): Route['name'] {
  if (r.name === 'playlist') return 'playlists';
  if (r.name === 'artist') return 'artists';
  return r.name;
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'settings':
      return <Settings />;
    default:
      return <p class="empty">Coming in the next task</p>;
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
