import { signal } from '@preact/signals';
import { auth } from './auth/browser';
import { visibleBanner } from './model/banner';
import { banner, dismissBanner, serverSignInRequired } from './model/state';
import { parseRoute, sameScreen, visitEntry, type Route } from './router';
import { SettingsPage } from './ui/settings/SettingsPage';
import { Connect } from './ui/Connect';
import { SignInGate } from './ui/signin/SignInGate';
import { Artists } from './ui/Artists';
import { CrateHub } from './ui/crate/CrateHub';
import { CrateView } from './ui/crate/CrateView';
import { Import } from './ui/Import';
import { AppFrame } from './ui/layout/AppFrame';
import { rememberRoute } from './ui/layout/Nav';
import { Workspace } from './ui/mix/Workspace';
import { Overview } from './ui/overview/Overview';
import { Playlists } from './ui/Playlists';
import { Top } from './ui/Top';

export const route = signal<Route>(parseRoute(location.hash));

/**
 * What boot is still doing. `main.tsx` is the only writer: it renders the
 * shell before it loads anything, so it sets the phase before the first
 * render and again as each step finishes. `linking`: a server magic link is
 * being exchanged; `signedout`: a server is set up and nobody is signed in
 * to it, so boot stopped before any read (round 011, FR-002).
 */
export const bootPhase = signal<
  'signin' | 'linking' | 'signedout' | 'loading' | 'ready'
>('loading');

export function installRouter(): void {
  // The entry the app booted on counts as visited, so a later back to it
  // restores its scroll position instead of jumping to the top.
  visitEntry(history);
  rememberRoute(route.value);
  addEventListener('hashchange', () => {
    const before = route.value;
    route.value = parseRoute(location.hash);
    rememberRoute(route.value);
    // A new screen starts at the top. Back and forward keep the position
    // the browser has already restored for them, and opening or closing a
    // details sheet keeps the list where it is (spec 003, US3).
    if (visitEntry(history) && !sameScreen(before, route.value)) {
      scrollTo(0, 0);
    }
  });
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'overview':
      return <Overview />;
    case 'crate':
      return <CrateHub />;
    case 'crateView':
      return (
        <CrateView
          view={route.view}
          period={route.period}
          detail={route.detail}
        />
      );
    case 'top':
      return <Top detail={route.detail} />;
    case 'playlists':
      return <Playlists />;
    case 'playlist':
      return <Playlists selected={route.id} detail={route.detail} />;
    case 'artists':
      return <Artists />;
    case 'artist':
      return <Artists selected={route.key} detail={route.detail} />;
    case 'import':
      return <Import />;
    case 'settings':
      return <SettingsPage item={route.item} />;
    case 'mix':
      return <Workspace mixKey={route.key} />;
  }
}

export function App() {
  const phase = bootPhase.value;
  // Only the sign-in screen, nothing of any user behind it (FR-002). Live:
  // a server session that ends while the app is open brings it back too.
  if (phase === 'linking') return <SignInGate linking />;
  if (phase === 'signedout' || serverSignInRequired()) return <SignInGate />;
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
