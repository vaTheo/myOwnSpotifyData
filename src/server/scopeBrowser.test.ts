import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PKCE_KEY,
  SESSION_KEY,
  createSessionStore,
  type StorageLike,
} from '../auth/session';
import {
  pinnedScope,
  scopedDbName,
  scopedKey,
  scopedView,
  setScopeForTests,
  watchScope,
  watchSession,
} from './scopeBrowser';
import { activate, writeActive } from './userScope';

const A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

function mem(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

afterEach(() => setScopeForTests(null));

describe('scopeBrowser', () => {
  it("is today's names without storage (Vitest has no localStorage)", () => {
    expect(scopedDbName('spotify-dj')).toBe('spotify-dj');
    expect(scopedKey('session')).toBe('session');
  });

  it('pins the scope at first use: another tab moving the pointer changes no name', () => {
    const s = mem();
    activate(s, { userId: A, email: '' }, true);
    setScopeForTests({ storage: s, enabled: true });
    expect(scopedDbName('spotify-dj')).toBe('spotify-dj');
    writeActive(s, { userId: B, email: '' }); // tab 2 signs in as B
    expect(scopedDbName('spotify-dj')).toBe('spotify-dj');
    const view = scopedView(s, ['session']);
    view.setItem('session', 'owner');
    expect(s.map.get('session')).toBe('owner');
    expect(s.map.has(`session:${B}`)).toBe(false);
  });

  it('the setter drops the pin', () => {
    const s = mem();
    activate(s, { userId: A, email: '' }, true);
    activate(s, { userId: B, email: '' }, true);
    setScopeForTests({ storage: s, enabled: true });
    expect(pinnedScope()).toBe(B);
    expect(scopedKey('pkce')).toBe(`pkce:${B}`);
    writeActive(s, { userId: A, email: '' });
    setScopeForTests({ storage: s, enabled: true });
    expect(pinnedScope()).toBe('');
  });

  it('watchScope reloads only when another tab changes the resolved user', () => {
    const s = mem();
    activate(s, { userId: A, email: '' }, true);
    setScopeForTests({ storage: s, enabled: true });
    let listener: ((e: { key: string | null }) => void) | null = null;
    const reload = vi.fn();
    watchScope({ addEventListener: (_t, l) => void (listener = l) }, reload);
    listener!({ key: 'quotaLock' });
    expect(reload).not.toHaveBeenCalled();
    writeActive(s, { userId: B, email: '' });
    activate(s, { userId: B, email: '' }, true);
    listener!({ key: 'activeUser' });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('watchScope is a no-op without a window', () => {
    expect(() => watchScope(undefined)).not.toThrow();
  });

  it('watchSession reloads the sign-in screen on a sign-in elsewhere, a signed-in page on a sign-out', () => {
    type L = (e: { key: string | null; newValue?: string | null }) => void;
    let listener: L | null = null;
    const reload = vi.fn();
    let signedIn = false;
    watchSession(
      () => signedIn,
      { addEventListener: (_t, l) => void (listener = l) },
      reload
    );
    listener!({ key: 'server-session', newValue: null });
    expect(reload).not.toHaveBeenCalled();
    listener!({ key: 'server-session', newValue: '{"accessToken":"t"}' });
    expect(reload).toHaveBeenCalledTimes(1);
    signedIn = true;
    listener!({ key: 'server-session', newValue: '{"accessToken":"u"}' });
    expect(reload).toHaveBeenCalledTimes(1);
    listener!({ key: 'server-session', newValue: null });
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('watchSession is a no-op without a window', () => {
    expect(() => watchSession(() => false, undefined)).not.toThrow();
  });

  it("Disconnect's clearAll for a non-claimer leaves the claimer's Spotify keys (T016)", () => {
    const s = mem();
    activate(s, { userId: A, email: '' }, true);
    activate(s, { userId: B, email: '' }, true);
    s.setItem(SESSION_KEY, '{"accessToken":"owner"}');
    s.setItem(PKCE_KEY, '{"verifier":"owner"}');
    s.setItem(`${SESSION_KEY}:${B}`, '{"accessToken":"b"}');
    s.setItem(`${PKCE_KEY}:${B}`, '{"verifier":"b"}');
    setScopeForTests({ storage: s, enabled: true });
    const auth = createSessionStore({
      storage: scopedView(s, [SESSION_KEY, PKCE_KEY]),
      fetchFn: (() => {
        throw new Error('no network');
      }) as unknown as typeof fetch,
      now: () => 0,
      navigate: () => undefined,
      clientId: 'cid',
      redirectUri: () => 'https://x.test/app/',
    });
    expect(auth.session.value?.accessToken).toBe('b');
    auth.clearAll();
    expect(s.map.has(`${SESSION_KEY}:${B}`)).toBe(false);
    expect(s.map.has(`${PKCE_KEY}:${B}`)).toBe(false);
    expect(s.map.get(SESSION_KEY)).toBe('{"accessToken":"owner"}');
    expect(s.map.get(PKCE_KEY)).toBe('{"verifier":"owner"}');
  });
});
