import { describe, expect, it } from 'vitest';
import {
  itemOfRoute,
  itemsOf,
  SETTINGS_GROUPS,
  SETTINGS_ITEMS,
  sectionDomId,
} from './sections';

describe('Settings items and groups (spec 026, US2)', () => {
  it('lists the seven items of US5 in page order', () => {
    expect(SETTINGS_ITEMS.map((s) => s.label)).toEqual([
      'Spotify account',
      'Spotify sync',
      'Listening history',
      'Audio data',
      'Artist reach',
      'Server',
      'Danger zone',
    ]);
  });

  it('groups them under Spotify, Your data and Between devices, the Danger zone apart', () => {
    expect(SETTINGS_GROUPS.map((g) => g.label)).toEqual([
      'Spotify',
      'Your data',
      'Between devices',
    ]);
    expect(itemsOf('spotify')).toEqual(['account', 'sync']);
    expect(itemsOf('data')).toEqual(['history', 'audio', 'reach']);
    expect(itemsOf('devices')).toEqual(['server']);
    expect(itemsOf(null)).toEqual(['danger']);
  });

  it('gives each item its own element id', () => {
    const ids = SETTINGS_ITEMS.map((s) => sectionDomId(s.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(sectionDomId('reach')).toBe('settings-reach');
  });

  it('reads the item a link names, and nothing else', () => {
    expect(itemOfRoute('reach')).toBe('reach');
    expect(itemOfRoute('nope')).toBeNull();
    expect(itemOfRoute(undefined)).toBeNull();
  });
});
