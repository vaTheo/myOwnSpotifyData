import { describe, expect, it } from 'vitest';
import { SESSION_KEY } from './session';
import {
  ACTIVE_KEY,
  DEVICE_OWNER_KEY,
  activate,
  claim,
  dbNameIn,
  keyIn,
  SERVER_SESSION_KEY,
  scopeChangedElsewhere,
  sessionChangedElsewhere,
  scopeOf,
  dbNameFor,
  isUserId,
  keyFor,
  readActive,
  readDeviceUsers,
  recordDeviceUser,
  reloadNeeded,
  scopedStorage,
  userIdFromToken,
  writeActive,
} from './userScope';

class Mem {
  map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

const A = 'aaaaaaaa-1111-4111-8111-bbbbbbbbbbbb';
const B = '22222222-2222-4222-8222-222222222222';

function jwt(payload: unknown): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64(payload)}.sig`;
}

describe('isUserId', () => {
  it('accepts a lowercase uuid', () => expect(isUserId(A)).toBe(true));
  it('rejects anything else', () => {
    for (const bad of [
      '',
      'x',
      A.toUpperCase(),
      `${A}-x`,
      '../../etc',
      'a b',
      null,
      5,
    ])
      expect(isUserId(bad)).toBe(false);
  });
});

describe('userIdFromToken', () => {
  it('reads sub', () => expect(userIdFromToken(jwt({ sub: A }))).toBe(A));
  it('is null without sub, with a bad sub or a malformed token', () => {
    expect(userIdFromToken(jwt({}))).toBeNull();
    expect(userIdFromToken(jwt({ sub: 'nope' }))).toBeNull();
    expect(userIdFromToken('a1')).toBeNull();
    expect(userIdFromToken('a.%%%.c')).toBeNull();
    expect(userIdFromToken('')).toBeNull();
  });
});

describe('claim', () => {
  it('the first sign-in claims, a second never changes it', () => {
    const s = new Mem();
    expect(claim(s, A)).toBe(A);
    expect(claim(s, B)).toBe(A);
    expect(s.getItem(DEVICE_OWNER_KEY)).not.toBeNull();
  });
  it('ignores a malformed stored owner and claims again', () => {
    const s = new Mem();
    s.setItem(DEVICE_OWNER_KEY, '{"userId":"../x"}');
    expect(claim(s, B)).toBe(B);
  });
});

describe('names', () => {
  it("the claimer keeps today's names", () => {
    const s = new Mem();
    claim(s, A);
    writeActive(s, { userId: A, email: 'a@x.fr' });
    expect(dbNameFor('spotify-dj', s, true)).toBe('spotify-dj');
    expect(keyFor('session', s, true)).toBe('session');
  });
  it('another user gets suffixed names', () => {
    const s = new Mem();
    claim(s, A);
    writeActive(s, { userId: B, email: 'b@x.fr' });
    expect(dbNameFor('spotify-dj', s, true)).toBe(`spotify-dj-u-${B}`);
    expect(keyFor('session', s, true)).toBe(`session:${B}`);
    expect(keyFor('pkce', s, true)).toBe(`pkce:${B}`);
  });
  it("without a server every name is today's, whatever is stored", () => {
    const s = new Mem();
    claim(s, A);
    writeActive(s, { userId: B, email: 'b@x.fr' });
    expect(dbNameFor('spotify-dj', s, false)).toBe('spotify-dj');
    expect(keyFor('session', s, false)).toBe('session');
  });
  it("nobody active gives today's names", () => {
    expect(dbNameFor('spotify-dj', new Mem(), true)).toBe('spotify-dj');
  });
});

describe('active pointer', () => {
  it('round-trips and clears', () => {
    const s = new Mem();
    writeActive(s, { userId: A, email: 'a@x.fr' });
    expect(readActive(s)).toEqual({ userId: A, email: 'a@x.fr' });
    writeActive(s, null);
    expect(readActive(s)).toBeNull();
    expect(s.getItem(ACTIVE_KEY)).toBeNull();
  });
  it('drops a pointer with a malformed id', () => {
    const s = new Mem();
    s.setItem(ACTIVE_KEY, '{"userId":"../..","email":"x"}');
    expect(readActive(s)).toBeNull();
  });
  it('drops unparsable JSON', () => {
    const s = new Mem();
    s.setItem(ACTIVE_KEY, '{');
    expect(readActive(s)).toBeNull();
  });
});

describe('device users', () => {
  it('records each person once and updates the email', () => {
    const s = new Mem();
    recordDeviceUser(s, { userId: A, email: 'a@x.fr' });
    recordDeviceUser(s, { userId: B, email: 'b@x.fr' });
    recordDeviceUser(s, { userId: A, email: 'new@x.fr' });
    expect(readDeviceUsers(s)).toEqual([
      { userId: A, email: 'new@x.fr' },
      { userId: B, email: 'b@x.fr' },
    ]);
  });
});

describe('reloadNeeded', () => {
  it('only when the user changes', () => {
    expect(reloadNeeded(A, A)).toBe(false);
    expect(reloadNeeded(null, A)).toBe(false);
    expect(reloadNeeded(A, B)).toBe(true);
    expect(reloadNeeded(A, null)).toBe(true);
  });
});

describe('scopedStorage', () => {
  it('maps only the named keys through keyFor and leaves others alone', () => {
    const s = new Mem();
    claim(s, A);
    writeActive(s, { userId: B, email: 'b@x.fr' });
    const view = scopedStorage(s, s, ['session', 'pkce'], true);
    view.setItem('session', 'tok');
    view.setItem('other', 'o');
    expect(s.getItem(`session:${B}`)).toBe('tok');
    expect(s.getItem('session')).toBeNull();
    expect(s.getItem('other')).toBe('o');
    expect(view.getItem('session')).toBe('tok');
    view.removeItem('session');
    expect(s.getItem(`session:${B}`)).toBeNull();
  });
});

describe('activate', () => {
  it('the owner with a pre-update session is claimed on first load, no reload, names unchanged', () => {
    const s = new Mem();
    expect(activate(s, { userId: A, email: 'a@x.y' }, true)).toEqual({
      ok: true,
      reload: false,
    });
    expect(readActive(s)).toEqual({ userId: A, email: 'a@x.y' });
    expect(readDeviceUsers(s)).toEqual([{ userId: A, email: 'a@x.y' }]);
    expect(dbNameFor('spotify-dj', s, true)).toBe('spotify-dj');
    expect(keyFor('session', s, true)).toBe('session');
  });

  it('the same user again needs no reload', () => {
    const s = new Mem();
    activate(s, { userId: A, email: 'a@x.y' }, true);
    expect(activate(s, { userId: A, email: 'a@x.y' }, true)).toEqual({
      ok: true,
      reload: false,
    });
  });

  it('another user after the claimer reloads, and the claim stays', () => {
    const s = new Mem();
    activate(s, { userId: A, email: 'a@x.y' }, true);
    expect(activate(s, { userId: B, email: 'b@x.y' }, true)).toEqual({
      ok: true,
      reload: true,
    });
    expect(dbNameFor('spotify-dj', s, true)).toBe(`spotify-dj-u-${B}`);
    expect(readDeviceUsers(s)).toHaveLength(2);
  });

  it("another user signing in with nobody active still reloads: the page holds the claimer's names", () => {
    const s = new Mem();
    claim(s, A);
    expect(activate(s, { userId: B, email: 'b@x.y' }, true)).toEqual({
      ok: true,
      reload: true,
    });
  });

  it('a session without a valid id is refused and writes nothing', () => {
    const s = new Mem();
    expect(activate(s, { userId: null, email: 'a@x.y' }, true)).toEqual({
      ok: false,
    });
    expect(activate(s, { userId: 'nope', email: 'a@x.y' }, true)).toEqual({
      ok: false,
    });
    expect(s.map.size).toBe(0);
  });
});

describe('pinned scope helpers', () => {
  it('scopeOf is empty for the claimer, nobody or no server, the id otherwise', () => {
    const s = new Mem();
    expect(scopeOf(s, true)).toBe('');
    activate(s, { userId: A, email: '' }, true);
    expect(scopeOf(s, true)).toBe('');
    activate(s, { userId: B, email: '' }, true);
    expect(scopeOf(s, true)).toBe(B);
    expect(scopeOf(s, false)).toBe('');
  });

  it('names from a scope id', () => {
    expect(dbNameIn('spotify-dj', '')).toBe('spotify-dj');
    expect(dbNameIn('spotify-dj', B)).toBe(`spotify-dj-u-${B}`);
    expect(keyIn('session', '')).toBe('session');
    expect(keyIn('session', B)).toBe(`session:${B}`);
  });
});

describe('scopeChangedElsewhere', () => {
  function device(): Mem {
    const s = new Mem();
    activate(s, { userId: A, email: '' }, true);
    return s;
  }

  it("the owner's tab reloads when another tab makes B active", () => {
    const s = device();
    writeActive(s, { userId: B, email: '' });
    expect(scopeChangedElsewhere(ACTIVE_KEY, s, true, '')).toBe(true);
  });

  it("B's tab reloads when another tab signs out (pointer removed)", () => {
    const s = device();
    writeActive(s, null);
    expect(scopeChangedElsewhere(ACTIVE_KEY, s, true, B)).toBe(true);
    expect(scopeChangedElsewhere(null, s, true, B)).toBe(true);
  });

  it('no reload when the resolved scope is the pinned one', () => {
    const s = device();
    writeActive(s, null);
    expect(scopeChangedElsewhere(ACTIVE_KEY, s, true, '')).toBe(false);
  });

  it('ignores other keys and a device without a server', () => {
    const s = device();
    writeActive(s, { userId: B, email: '' });
    expect(scopeChangedElsewhere('quotaLock', s, true, '')).toBe(false);
    expect(scopeChangedElsewhere(ACTIVE_KEY, s, false, '')).toBe(false);
  });
});

describe('sessionChangedElsewhere (round 009 T015)', () => {
  const SESSION = JSON.stringify({ accessToken: 't' });

  it('names the server session key', () => {
    expect(SERVER_SESSION_KEY).toBe(SESSION_KEY);
  });

  it('a tab showing the sign-in screen reloads when another tab signs in', () => {
    expect(sessionChangedElsewhere(SESSION_KEY, SESSION, false)).toBe(true);
  });

  it('a signed-in tab reloads when another tab signs out, whatever the scope', () => {
    expect(sessionChangedElsewhere(SESSION_KEY, null, true)).toBe(true);
    expect(sessionChangedElsewhere(null, null, true)).toBe(true);
  });

  it('a refresh elsewhere, a clear on the sign-in screen and other keys do nothing', () => {
    expect(sessionChangedElsewhere(SESSION_KEY, SESSION, true)).toBe(false);
    expect(sessionChangedElsewhere(SESSION_KEY, null, false)).toBe(false);
    expect(sessionChangedElsewhere(null, null, false)).toBe(false);
    expect(sessionChangedElsewhere('session', SESSION, false)).toBe(false);
    expect(sessionChangedElsewhere(ACTIVE_KEY, null, true)).toBe(false);
  });
});
