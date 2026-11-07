import { signal } from '@preact/signals';
import {
  destinationOf,
  routeHref,
  type Destination,
  type Route,
} from '../../router';
import { Icon, type IconName } from '../icons';

interface NavItem {
  destination: Destination;
  label: string;
  icon: IconName;
  home: Route;
}

/**
 * The destinations in rail order (contracts/routes.md): Overview first, the
 * home (US8); Settings last, at the foot of the rail. Five fit a phone's
 * bottom bar, the most Material allows there.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    destination: 'overview',
    label: 'Overview',
    icon: 'home',
    home: { name: 'overview' },
  },
  {
    destination: 'listening',
    label: 'Listening',
    icon: 'headphones',
    home: { name: 'top' },
  },
  {
    destination: 'library',
    label: 'Library',
    icon: 'library_music',
    home: { name: 'playlists' },
  },
  {
    destination: 'mix',
    label: 'Mix',
    icon: 'queue_music',
    home: { name: 'mix' },
  },
  {
    destination: 'settings',
    label: 'Settings',
    icon: 'settings',
    home: { name: 'settings' },
  },
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
  const kept: Route =
    'detail' in route && route.detail !== undefined
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
    <nav class="nav" aria-label="Main">
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
            <span class="nav-label">{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
