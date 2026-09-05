import { describe, expect, it } from 'vitest';
import { errorBanner, visibleBanner, warnBanner } from './banner';

describe('errorBanner', () => {
  it('is red and, by default, shown on every screen', () => {
    const message = errorBanner('Sync failed: 503 from Spotify.');
    expect(message).toEqual({
      text: 'Sync failed: 503 from Spotify.',
      kind: 'error',
      inlineOn: [],
    });
  });

  it('records the screens that print the same message inline', () => {
    expect(errorBanner('Boom.', ['settings']).inlineOn).toEqual(['settings']);
  });
});

describe('warnBanner', () => {
  it('is amber and never suppressed', () => {
    expect(warnBanner('Spotify quota reached.')).toEqual({
      text: 'Spotify quota reached.',
      kind: 'warn',
      inlineOn: [],
    });
  });
});

describe('visibleBanner', () => {
  it('passes nothing through when there is no message', () => {
    expect(visibleBanner(null, 'settings')).toBeNull();
  });

  it('hides a message the current screen already prints inline', () => {
    const message = errorBanner('Rekordbox import failed.', ['settings']);
    expect(visibleBanner(message, 'settings')).toBeNull();
  });

  it('shows the same message on a screen that does not print it', () => {
    const message = errorBanner('Rekordbox import failed.', ['settings']);
    expect(visibleBanner(message, 'crate')).toBe(message);
    expect(visibleBanner(message, 'playlist')).toBe(message);
  });

  it('shows a message no screen prints inline', () => {
    const message = warnBanner('Spotify quota reached.');
    expect(visibleBanner(message, 'settings')).toBe(message);
  });
});
