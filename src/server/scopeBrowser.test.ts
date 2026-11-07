import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StorageLike } from '../auth/session';
import {
  pinnedScope,
  scopedDbName,
  scopedKey,
  scopedView,
  setScopeForTests,
  watchScope,
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
});
