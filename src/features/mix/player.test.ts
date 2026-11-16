import { describe, expect, it } from 'vitest';
import { SC_PLAYER_PREFIX, soundcloudPlayerSrc } from './player';

describe('soundcloudPlayerSrc', () => {
  it('builds the player from the permalink, on the literal prefix', () => {
    const src = soundcloudPlayerSrc(
      'https://soundcloud.com/monument-podcast/mnmt-496'
    );
    expect(src).toBe(
      `${SC_PLAYER_PREFIX}?url=${encodeURIComponent('https://soundcloud.com/monument-podcast/mnmt-496')}&visual=true`
    );
  });

  it('is null for what is not a SoundCloud permalink', () => {
    expect(soundcloudPlayerSrc('https://on.soundcloud.com/abc')).toBeNull();
    expect(soundcloudPlayerSrc('https://example.com/a/b')).toBeNull();
    expect(soundcloudPlayerSrc('not a url')).toBeNull();
  });
});
