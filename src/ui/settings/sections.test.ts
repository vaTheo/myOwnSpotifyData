import { describe, expect, it } from 'vitest';
import {
  SETTINGS_SECTIONS,
  sectionDomId,
  sectionIdOf,
  sectionInView,
  type SectionId,
} from './sections';

const ORDER = SETTINGS_SECTIONS.map((s) => s.id);

describe('SETTINGS_SECTIONS', () => {
  it('lists the Updates section (round 006) and the seven sections of US5 in page order', () => {
    expect(SETTINGS_SECTIONS.map((s) => s.label)).toEqual([
      'Updates',
      'Spotify account',
      'Spotify sync',
      'Listening history',
      'Audio data',
      'Artist reach',
      'Server',
      'Danger zone',
    ]);
  });

  it('gives each section its own element id', () => {
    const ids = ORDER.map(sectionDomId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(sectionDomId('reach')).toBe('settings-reach');
  });

  it('reads a section back from its element id, and nothing else', () => {
    for (const id of ORDER) expect(sectionIdOf(sectionDomId(id))).toBe(id);
    expect(sectionIdOf('settings-nope')).toBeNull();
    expect(sectionIdOf('reach')).toBeNull();
  });
});

describe('sectionInView', () => {
  const visible = (...ids: SectionId[]) => new Set<SectionId>(ids);

  it('marks the first visible section in page order', () => {
    expect(sectionInView(ORDER, visible('server', 'reach'), 'account')).toBe(
      'reach'
    );
  });

  it('keeps the current mark while no section is in the band', () => {
    expect(sectionInView(ORDER, visible(), 'audio')).toBe('audio');
  });

  it('marks the last section once the page is scrolled to its end', () => {
    expect(
      sectionInView(ORDER, visible('server', 'danger'), 'server', true)
    ).toBe('danger');
  });
});
