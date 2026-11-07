/// <reference types="node" />
/**
 * The visual loop (spec 003, research D19): every page of the app, at four
 * widths, on the demo data of `yarn dev` with `?demo`. Dev only: not in
 * `yarn test`, not in CI. Run with `yarn shots`; outputs land in
 * `shots-output/` and `playwright-report/`, both gitignored.
 */
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BASE = 'http://127.0.0.1:5173/myOwnSpotifyData/';

const WIDTHS = [
  { name: '1440', viewport: { width: 1440, height: 900 } },
  { name: '1024', viewport: { width: 1024, height: 768 } },
  { name: '768', viewport: { width: 768, height: 1024 } },
  { name: '390', viewport: { width: 390, height: 844 } },
];

/**
 * Other engines, on demand only (T099): `SHOTS_BROWSERS=all` (both),
 * `firefox` or `webkit`, at 1440 px. `browserName` is set here, else the
 * top-level `chromium` wins over the device preset. WebKit needs system
 * libraries Debian names differently (libicu74, libjpeg-turbo8): on the
 * owner's LMDE 7 it does not launch without them.
 */
const ENGINES = {
  firefox: { device: 'Desktop Firefox', browserName: 'firefox' },
  webkit: { device: 'Desktop Safari', browserName: 'webkit' },
} as const;
const wanted = process.env.SHOTS_BROWSERS ?? '';
const unknown = wanted
  .split(',')
  .filter((e) => e !== '' && e !== 'all' && !(e in ENGINES));
if (unknown.length > 0) {
  throw new Error(
    `SHOTS_BROWSERS: unknown ${unknown.join(', ')}; use all, firefox or webkit (comma-separated)`
  );
}
const extraBrowsers = (Object.keys(ENGINES) as (keyof typeof ENGINES)[])
  .filter((e) => wanted === 'all' || wanted.split(',').includes(e))
  .map((e) => ({
    name: `${e}-1440`,
    use: {
      ...devices[ENGINES[e].device],
      browserName: ENGINES[e].browserName,
      deviceScaleFactor: 1,
      viewport: { width: 1440, height: 900 },
    },
  }));

export default defineConfig({
  testDir: '.',
  testMatch: '*.shots.ts',
  outputDir: `${ROOT}shots-output/results`,
  snapshotPathTemplate: `${ROOT}shots-output/baselines/{projectName}/{arg}{ext}`,
  fullyParallel: true,
  workers: 4,
  timeout: 60_000,
  reporter: [
    ['list'],
    ['json', { outputFile: `${ROOT}shots-output/report.json` }],
    ['html', { outputFolder: `${ROOT}playwright-report`, open: 'never' }],
  ],
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: 'disabled' },
  },
  use: {
    baseURL: BASE,
    browserName: 'chromium',
    deviceScaleFactor: 1,
    locale: 'en-GB',
    timezoneId: 'Europe/Paris',
    colorScheme: 'dark',
  },
  projects: [
    ...WIDTHS.map((w) => ({ name: w.name, use: { viewport: w.viewport } })),
    ...extraBrowsers,
  ],
  webServer: {
    command: 'yarn dev --host 127.0.0.1 --port 5173 --strictPort',
    url: BASE,
    cwd: ROOT,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
