import { signal } from '@preact/signals';
import {
  destinationOf,
  routeHref,
  type Destination,
  type Route,
} from '../../router';
import { msg } from '../../i18n';
import { Icon, type IconName } from '../icons';

interface NavItem {
  destination: Destination;
  label: string;
  /** The label under the icon, when the full one does not fit there. */
  short: string;
  icon: IconName;
  home: Route;
}

/**
 * The destinations in rail order (contracts/routes.md): Overview first, the
 * home (US8); Settings last, at the foot of the rail. Five fit a phone's
 * bottom bar, the most Material allows there.
 */
const navItem = (
  destination: Destination,
  icon: IconName,
  home: Route
): NavItem => ({
  destination,
  icon,
  home,
  // Read when drawn, so the label follows the language shown (spec 031).
  get label(): string {
    return msg().frame.nav[destination];
  },
  get short(): string {
    const nav = msg().frame.nav;
    return destination === 'overview' ? nav.overviewShort : nav[destination];
  },
});

export const NAV_ITEMS: NavItem[] = [
  navItem('overview', 'home', { name: 'overview' }),
  navItem('listening', 'headphones', { name: 'top' }),
  navItem('library', 'library_music', { name: 'playlists' }),
  navItem('mix', 'queue_music', { name: 'mix' }),
  navItem('settings', 'settings', { name: 'settings' }),
];

/**
 * The last route the owner used inside each destination, this session: the
 * rail link reopens where they were (spec 003, FR-002). A detail sheet is
 * not carried over; the list it was open on is.
 */
export const lastRouteIn = signal<Partial<Record<Destination, Route>>>({});

/** The same, per tab of Listening and Library: the Crate tab reopens its view. */
export const lastRouteInTab = signal<Partial<Record<string, Route>>>({});

export function rememberRoute(route: Route): void {
  const { destination, tab } = destinationOf(route);
  // The Settings item a link opened is not kept: the nav lands on the page.
  const kept: Route =
    route.name === 'settings'
      ? { name: 'settings' }
      : 'detail' in route && route.detail !== undefined
        ? ({ ...route, detail: undefined } as Route)
        : route;
  lastRouteIn.value = { ...lastRouteIn.value, [destination]: kept };
  if (tab) lastRouteInTab.value = { ...lastRouteInTab.value, [tab]: kept };
}

/**
 * One navigation for every width (spec 003, FR-002, FR-003). CSS draws it as
 * a bottom bar on compact windows, an 80 px rail from medium up and the
 * expanded rail with labels beside the icons on large ones. The current
 * destination carries an indicator, a filled icon and a heavier label, not
 * colour alone.
 */
export function Nav(p: { current: Route }) {
  const active = destinationOf(p.current).destination;
  return (
    <nav class="nav" aria-label={msg().frame.nav.main}>
      {NAV_ITEMS.map((item) => {
        const on = item.destination === active;
        const target = lastRouteIn.value[item.destination] ?? item.home;
        return (
          <a
            key={item.destination}
            href={routeHref(target)}
            class={[
              'nav-item',
              on ? 'active' : '',
              item.destination === 'settings' ? 'nav-foot' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-current={on ? 'page' : undefined}
          >
            <span class="nav-indicator">
              <Icon name={item.icon} filled={on} />
            </span>
            {item.short === item.label ? (
              <span class="nav-label">{item.label}</span>
            ) : (
              <>
                <span class="nav-label nav-label-full">{item.label}</span>
                <span class="nav-label nav-label-short">{item.short}</span>
              </>
            )}
          </a>
        );
      })}
    </nav>
  );
}
