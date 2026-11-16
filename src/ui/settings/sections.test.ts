import { afterEach, describe, expect, it } from 'vitest';
import { lang } from '../../i18n';
import {
  itemOfRoute,
  itemsOf,
  SETTINGS_GROUPS,
  SETTINGS_ITEMS,
  sectionDomId,
} from './sections';

describe('Settings items and groups (spec 026, US2)', () => {
  afterEach(() => {
    lang.value = 'en';
  });

  it('lists the items in page order, Language before the Danger zone (spec 031)', () => {
    expect(SETTINGS_ITEMS.map((s) => s.label)).toEqual([
      'Spotify account',
      'Spotify sync',
      'Listening history',
      'Audio data',
      'Artist reach',
      'Server',
      'Language',
      'Danger zone',
    ]);
  });

  it('groups them under Spotify, Your data, Between devices and This device, the Danger zone apart', () => {
    expect(SETTINGS_GROUPS.map((g) => g.label)).toEqual([
      'Spotify',
      'Your data',
      'Between devices',
      'This device',
    ]);
    expect(itemsOf('spotify')).toEqual(['account', 'sync']);
    expect(itemsOf('data')).toEqual(['history', 'audio', 'reach']);
    expect(itemsOf('devices')).toEqual(['server']);
    expect(itemsOf('device')).toEqual(['language']);
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

  it('names the items and groups in the language shown (spec 031)', () => {
    lang.value = 'fr';
    expect(SETTINGS_ITEMS.map((s) => s.label)).toEqual([
      'Compte Spotify',
      'Synchronisation Spotify',
      'Historique d’écoute',
      'Données audio',
      'Audience des artistes',
      'Serveur',
      'Langue',
      'Zone de danger',
    ]);
    expect(SETTINGS_GROUPS.map((g) => g.label)).toEqual([
      'Spotify',
      'Vos données',
      'Entre appareils',
      'Cet appareil',
    ]);
    expect(itemOfRoute('language')).toBe('language');
  });
});
