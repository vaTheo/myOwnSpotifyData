import { msg } from '../../i18n';

/**
 * The Settings items in page order and their groups (spec 026, US2,
 * contracts/screens.md §13): Spotify · Your data · Between devices · This
 * device, then the Danger zone apart. Above them, never folded, the Sync
 * status block. A label is read from the catalogue each time it is drawn, so
 * it follows the language shown (spec 031).
 */
export const SETTINGS_GROUPS = [
  {
    id: 'spotify',
    get label() {
      return msg().settings.groups.spotify;
    },
  },
  {
    id: 'data',
    get label() {
      return msg().settings.groups.data;
    },
  },
  {
    id: 'devices',
    get label() {
      return msg().settings.groups.devices;
    },
  },
  {
    id: 'device',
    get label() {
      return msg().settings.groups.device;
    },
  },
] as const;

export type GroupId = (typeof SETTINGS_GROUPS)[number]['id'];

const item = <I extends keyof ReturnType<typeof msg>['settings']['items']>(
  id: I,
  group: GroupId | null
) => ({
  id,
  group,
  get label(): string {
    return msg().settings.items[id];
  },
});

export const SETTINGS_ITEMS = [
  item('account', 'spotify'),
  item('sync', 'spotify'),
  item('history', 'data'),
  item('audio', 'data'),
  item('reach', 'data'),
  item('server', 'devices'),
  item('language', 'device'),
  item('danger', null),
] as const;

export type SectionId = (typeof SETTINGS_ITEMS)[number]['id'];

const PREFIX = 'settings-';

/** The element id of an item's card; the address never changes. */
export function sectionDomId(id: SectionId): string {
  return `${PREFIX}${id}`;
}

/** The item a `#/settings/<item>` link names, or null for any other text. */
export function itemOfRoute(item: string | undefined): SectionId | null {
  return SETTINGS_ITEMS.find((s) => s.id === item)?.id ?? null;
}

/** The items of a group, in page order; `null` gives the ones apart. */
export function itemsOf(group: GroupId | null): SectionId[] {
  return SETTINGS_ITEMS.filter((s) => s.group === group).map((s) => s.id);
}
