import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSONP_TIMEOUT_MS, jsonp } from './jsonp';

interface FakeScript {
  src: string;
  onerror: ((event: Event | string) => void) | null;
  removed: boolean;
  remove: () => void;
}

const globals = globalThis as unknown as Record<string, unknown>;
const DEEZER = 'https://api.deezer.com/artist/27?output=jsonp';

let scripts: FakeScript[] = [];

/** Vitest runs in Node, so the helper's `document` is supplied here. */
function installDocument(respond?: (script: FakeScript) => unknown): void {
  scripts = [];
  globals.document = {
    createElement: (): FakeScript => ({
      src: '',
      onerror: null,
      removed: false,
      remove(): void {
        this.removed = true;
      },
    }),
    head: {
      appendChild: (script: FakeScript): FakeScript => {
        scripts.push(script);
        if (respond) {
          const name = callbackName(script);
          const fn = globals[name] as (value: unknown) => void;
          fn(respond(script));
        }
        return script;
      },
    },
  };
}

function callbackName(script: FakeScript): string {
  return script.src.split('callback=')[1];
}

afterEach(() => {
  vi.useRealTimers();
  delete globals.document;
});

describe('jsonp', () => {
  it('names a fresh callback per request and hands the value back untouched', async () => {
    installDocument((script) => ({ artist: { name: script.src } }));
    const first = await jsonp(DEEZER, JSONP_TIMEOUT_MS);
    const second = await jsonp(DEEZER, JSONP_TIMEOUT_MS);
    const names = scripts.map(callbackName);
    expect(names[0]).not.toBe(names[1]);
    expect(names.every((name) => name.startsWith('__djReach'))).toBe(true);
    expect(scripts[0].src).toBe(`${DEEZER}&callback=${names[0]}`);
    // The helper declares `unknown`, so the test narrows it itself.
    const body = first as { artist: { name: string } };
    expect(body.artist.name).toBe(`${DEEZER}&callback=${names[0]}`);
    expect(second).not.toEqual(first);
  });

  it('starts the query string when the url has none', async () => {
    installDocument(() => 1);
    await jsonp('https://api.deezer.com/artist/27', JSONP_TIMEOUT_MS);
    expect(scripts[0].src).toBe(
      `https://api.deezer.com/artist/27?callback=${callbackName(scripts[0])}`
    );
  });

  it('deletes the global and removes the script on success', async () => {
    installDocument(() => ({ nb_fan: 585 }));
    await jsonp(DEEZER, JSONP_TIMEOUT_MS);
    expect(globals[callbackName(scripts[0])]).toBeUndefined();
    expect(scripts[0].removed).toBe(true);
  });

  it('rejects and cleans up when the script fails to load', async () => {
    installDocument();
    const pending = jsonp(DEEZER, JSONP_TIMEOUT_MS);
    scripts[0].onerror?.('error');
    await expect(pending).rejects.toThrow(`JSONP request failed: ${DEEZER}`);
    expect(globals[callbackName(scripts[0])]).toBeUndefined();
    expect(scripts[0].removed).toBe(true);
  });

  it('rejects after ten seconds of silence and cleans up', async () => {
    vi.useFakeTimers();
    installDocument();
    expect(JSONP_TIMEOUT_MS).toBe(10_000);
    let settled = false;
    const pending = jsonp(DEEZER, JSONP_TIMEOUT_MS);
    void pending.catch(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(JSONP_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).rejects.toThrow(
      `JSONP request timed out after 10000 ms: ${DEEZER}`
    );
    expect(globals[callbackName(scripts[0])]).toBeUndefined();
    expect(scripts[0].removed).toBe(true);
  });

  it('leaves no timer behind once the callback has answered', async () => {
    vi.useFakeTimers();
    installDocument(() => 'done');
    await jsonp(DEEZER, JSONP_TIMEOUT_MS);
    expect(vi.getTimerCount()).toBe(0);
  });
});
