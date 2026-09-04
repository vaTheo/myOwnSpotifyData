import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('reads the Spotify settings from the environment', () => {
    expect(
      loadConfig({
        SPOTIFY_CLIENT_ID: 'id',
        SPOTIFY_CLIENT_SECRET: 'secret',
        SPOTIFY_REDIRECT_URI: 'http://127.0.0.1:8888/callback',
      })
    ).toEqual({
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'http://127.0.0.1:8888/callback',
    });
  });

  it('throws when a variable is missing', () => {
    expect(() => loadConfig({ SPOTIFY_CLIENT_ID: 'id' })).toThrow(
      'SPOTIFY_CLIENT_SECRET'
    );
  });
});
