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
 * element is removed in every outcome. The callback name is forgotten right
 * away on a success or a load error — neither can fire again for this
 * request — but a timeout leaves it answering to a no-op for one more grace
 * period first: the `<script>`'s underlying fetch can still be in flight and
 * land after the timeout has already rejected, and deleting the name outright
 * would turn that late call into a thrown error instead of a silent no-op.
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

    function detach(): void {
      clearTimeout(timer);
      script.onerror = null;
      script.remove();
    }

    globals[name] = (value: unknown): void => {
      detach();
      delete globals[name];
      resolve(value);
    };
    script.onerror = (): void => {
      detach();
      delete globals[name];
      reject(new Error(`JSONP request failed: ${url}`));
    };
    const timer = setTimeout(() => {
      detach();
      // Swap in a no-op rather than deleting: a response that lands after
      // this rejection must be swallowed, never thrown as a ReferenceError.
      // The name is forgotten for real only once nothing can plausibly still
      // call it — one more timeout's worth of margin.
      globals[name] = (): void => {};
      setTimeout(() => delete globals[name], timeoutMs);
      reject(
        new Error(`JSONP request timed out after ${timeoutMs} ms: ${url}`)
      );
    }, timeoutMs);

    // Nothing between the two handlers above and `timer` can invoke either
    // of them, so `detach` never reads `timer` before it is initialised; the
    // script is appended last, so nothing can answer into a half-built
    // request. Keep this order: `timer` must stay a `const` for ESLint's
    // prefer-const, and it must stay below the handlers that clear it.
    script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${name}`;
    document.head.appendChild(script);
  });
}
