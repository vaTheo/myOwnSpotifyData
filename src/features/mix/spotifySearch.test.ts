import { describe, expect, it } from 'vitest';
import type { Session } from '../../auth/session';
import { canCreatePlaylists } from './spotifySearch';

function session(scope: string): Session {
  return {
    accessToken: 'at',
    expiresAt: 0,
    refreshToken: 'rt',
    scope,
  };
}

describe('canCreatePlaylists', () => {
  it('is true when the scope carries the exact modify token', () => {
    expect(
      canCreatePlaylists(
        session('user-top-read playlist-read-private playlist-modify-private')
      )
    ).toBe(true);
  });

  it('is false for a session without the modify scope', () => {
    expect(
      canCreatePlaylists(session('user-top-read playlist-read-private'))
    ).toBe(false);
  });

  it('is false for an empty scope', () => {
    expect(canCreatePlaylists(session(''))).toBe(false);
  });

  it('is false for a null session', () => {
    expect(canCreatePlaylists(null)).toBe(false);
  });

  it('rejects a scope that merely contains the substring', () => {
    expect(
      canCreatePlaylists(session('user-top-read playlist-modify-private-xyz'))
    ).toBe(false);
  });
});
