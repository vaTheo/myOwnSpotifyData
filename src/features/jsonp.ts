/**
 * Script-injection transport. Deezer sends no `access-control-allow-origin`
 * header at all, so it can only be read this way (spec §3.4, research §2).
 */

/**
 * JSONP has no status codes, so a silent timeout is a retry, never a miss.
 * This is a separate budget from `REACH_REQUEST_TIMEOUT_MS`.
 */
export const JSONP_TIMEOUT_MS = 10_000;

let counter = 0;

/**
 * Appends `&callback=<a name used once>` to `url`, loads it as a script and
 * resolves with whatever the remote script passed to that callback. The
 * global and the element go away in every outcome.
 *
 * It resolves with `unknown` on purpose: a remote script runs in the page's
 * own context, so a caller-chosen generic would be an assertion rather than a
 * check. Narrowing is the caller's job (spec §3.3). The callback is assigned
 * on `globalThis`, which is `window` in a browser and is also what a Node
 * test can reach.
 */
export function jsonp(url: string, timeoutMs: number): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    counter += 1;
    const name = `__djReach${counter}`;
    const globals = globalThis as unknown as Record<string, unknown>;
    const script = document.createElement('script');

    function cleanUp(): void {
      clearTimeout(timer);
      delete globals[name];
      script.onerror = null;
      script.remove();
    }

    globals[name] = (value: unknown): void => {
      cleanUp();
      resolve(value);
    };
    script.onerror = (): void => {
      cleanUp();
      reject(new Error(`JSONP request failed: ${url}`));
    };
    const timer = setTimeout(() => {
      cleanUp();
      reject(
        new Error(`JSONP request timed out after ${timeoutMs} ms: ${url}`)
      );
    }, timeoutMs);

    // Nothing between the two handlers above and `timer` can invoke either
    // of them, so `cleanUp` never reads `timer` before it is initialised; the
    // script is appended last, so nothing can answer into a half-built
    // request. Keep this order: `timer` must stay a `const` for ESLint's
    // prefer-const, and it must stay below the handlers that clear it.
    script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${name}`;
    document.head.appendChild(script);
  });
}
