/**
 * The Settings items in page order and their groups (spec 026, US2,
 * contracts/screens.md §13): Spotify · Your data · Between devices, then the
 * Danger zone apart. Above them, never folded, the Sync status block.
 */
export const SETTINGS_GROUPS = [
  { id: 'spotify', label: 'Spotify' },
  { id: 'data', label: 'Your data' },
  { id: 'devices', label: 'Between devices' },
] as const;

export type GroupId = (typeof SETTINGS_GROUPS)[number]['id'];

export const SETTINGS_ITEMS = [
  { id: 'account', label: 'Spotify account', group: 'spotify' },
  { id: 'sync', label: 'Spotify sync', group: 'spotify' },
  { id: 'history', label: 'Listening history', group: 'data' },
  { id: 'audio', label: 'Audio data', group: 'data' },
  { id: 'reach', label: 'Artist reach', group: 'data' },
  { id: 'server', label: 'Server', group: 'devices' },
  { id: 'danger', label: 'Danger zone', group: null },
] as const satisfies readonly {
  id: string;
  label: string;
  group: GroupId | null;
}[];

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
