/// <reference types="node" />
/**
 * The end-to-end regression suite (spec 003, T112): one test per row of
 * `specs/003-web-first-redesign/regression.md` that the demo can drive. It
 * asserts results, not looks: no screenshot, no axe. Dev only, like the
 * visual loop: `yarn regression`; judge it by its exit code.
 *
 * Chromium by default; `REGRESSION_BROWSERS=firefox`, `webkit`, a
 * comma-separated list or `all` picks others (WebKit needs the system
 * libraries the visual loop's config names).
 */
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BASE = 'http://127.0.0.1:5173/myOwnSpotifyData/';

const ENGINES = {
  chromium: 'Desktop Chrome',
  firefox: 'Desktop Firefox',
  webkit: 'Desktop Safari',
} as const;
type Engine = keyof typeof ENGINES;

const wanted = (process.env.REGRESSION_BROWSERS ?? 'chromium')
  .split(',')
  .filter((e) => e !== '');
const unknown = wanted.filter((e) => e !== 'all' && !(e in ENGINES));
if (unknown.length > 0) {
  throw new Error(
    `REGRESSION_BROWSERS: unknown ${unknown.join(', ')}; use all, chromium, firefox or webkit (comma-separated)`
  );
}
const engines = (Object.keys(ENGINES) as Engine[]).filter(
  (e) => wanted.includes('all') || wanted.includes(e)
);

export default defineConfig({
  testDir: '.',
  testMatch: 'regression.spec.ts',
  outputDir: `${ROOT}shots-output/regression`,
  fullyParallel: true,
  workers: 4,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: BASE,
    deviceScaleFactor: 1,
    locale: 'en-GB',
    timezoneId: 'Europe/Paris',
    colorScheme: 'dark',
  },
  projects: engines.map((e) => ({
    name: e,
    use: {
      ...devices[ENGINES[e]],
      browserName: e,
      deviceScaleFactor: 1,
      viewport: { width: 1440, height: 900 },
    },
  })),
  webServer: {
    command: 'yarn dev --host 127.0.0.1 --port 5173 --strictPort',
    url: BASE,
    cwd: ROOT,
    // This worktree's own server, never another one's (S13 C1).
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
