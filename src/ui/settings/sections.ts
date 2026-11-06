/**
 * The Settings sections in page order (spec 003, US5, contracts/screens.md
 * §13), shared by the page and its section index.
 */
export const SETTINGS_SECTIONS = [
  { id: 'account', label: 'Spotify account' },
  { id: 'sync', label: 'Spotify sync' },
  { id: 'history', label: 'Listening history' },
  { id: 'audio', label: 'Audio data' },
  { id: 'reach', label: 'Artist reach' },
  { id: 'server', label: 'Server' },
  { id: 'danger', label: 'Danger zone' },
] as const;

export type SectionId = (typeof SETTINGS_SECTIONS)[number]['id'];

const PREFIX = 'settings-';

/** The element id of a section's card; the address never changes. */
export function sectionDomId(id: SectionId): string {
  return `${PREFIX}${id}`;
}

/** The section of an element id made by `sectionDomId`, or null. */
export function sectionIdOf(domId: string): SectionId | null {
  if (!domId.startsWith(PREFIX)) return null;
  const id = domId.slice(PREFIX.length);
  return SETTINGS_SECTIONS.find((s) => s.id === id)?.id ?? null;
}

/**
 * The section the index marks: the first one in page order that sits in the
 * observed band, or the last one once the page cannot scroll further (a
 * short last card never reaches the band). With nothing in the band the
 * mark stays where it was.
 */
export function sectionInView(
  order: readonly SectionId[],
  visible: ReadonlySet<SectionId>,
  current: SectionId,
  atEnd = false
): SectionId {
  if (atEnd && order.length > 0) return order[order.length - 1];
  return order.find((id) => visible.has(id)) ?? current;
}
