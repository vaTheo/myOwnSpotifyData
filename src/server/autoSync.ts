/**
 * Automatic server sync (after the worker round). The server is the owner's
 * own free project, so asking it costs nothing; Spotify is never read here
 * (ADR-02). Pushes already go after every change (`queueServerPush`); this
 * adds the pulls:
 *
 * - back to the app (tab visible again) after `RESUME_GAP_MS` or more: push
 *   what is pending, then pull;
 * - the network back (`online`): the same, at once;
 * - while visible and a request waits or runs on the computer: a pull every
 *   `ACTIVE_POLL_MS`, so its state and result appear without a tap.
 */

export const RESUME_GAP_MS = 60_000;
export const ACTIVE_POLL_MS = 60_000;

export interface AutoSyncDeps {
  /** `document`: its visibility and its `visibilitychange` event. */
  doc: {
    visibilityState: string;
    addEventListener(type: 'visibilitychange', fn: () => void): void;
    removeEventListener(type: 'visibilitychange', fn: () => void): void;
  };
  /** `window`: the `online` event and the timer. */
  win: {
    addEventListener(type: 'online', fn: () => void): void;
    removeEventListener(type: 'online', fn: () => void): void;
    setInterval(fn: () => void, ms: number): number;
    clearInterval(id: number): void;
  };
  now: () => number;
  /** Signed in to Spotify and to the server. */
  enabled: () => boolean;
  /** A request waits or runs on the computer. */
  hasActiveRequest: () => boolean;
  /** Pending pushes, then a pull (`startServerSync`). */
  sync: () => Promise<void>;
  /** A pull alone (`startServerPull`). */
  pull: () => Promise<void>;
}

/** Installs the triggers; the open's own sync counts as the first. Returns the uninstall. */
export function installAutoSync(deps: AutoSyncDeps): () => void {
  let last = deps.now();
  const visible = () => deps.doc.visibilityState === 'visible';

  const onVisible = () => {
    if (!visible() || !deps.enabled()) return;
    if (deps.now() - last < RESUME_GAP_MS) return;
    last = deps.now();
    void deps.sync();
  };
  const onOnline = () => {
    if (!deps.enabled()) return;
    last = deps.now();
    void deps.sync();
  };
  const onTick = () => {
    if (!visible() || !deps.enabled() || !deps.hasActiveRequest()) return;
    // A resume or online sync a moment ago already pulled.
    if (deps.now() - last < ACTIVE_POLL_MS / 2) return;
    last = deps.now();
    void deps.pull();
  };

  deps.doc.addEventListener('visibilitychange', onVisible);
  deps.win.addEventListener('online', onOnline);
  const timer = deps.win.setInterval(onTick, ACTIVE_POLL_MS);
  return () => {
    deps.doc.removeEventListener('visibilitychange', onVisible);
    deps.win.removeEventListener('online', onOnline);
    deps.win.clearInterval(timer);
  };
}
