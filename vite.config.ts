/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import pkg from './package.json' with { type: 'json' };

/**
 * Fills the two placeholders of index.html's Content Security Policy: the
 * owner's server URL (a public setting, empty when no server is set up) and,
 * on the dev server only, the HMR websocket. Done here rather than with
 * Vite's `%VAR%` syntax because an unset `%VAR%` is left in place, which
 * would put a literal token into the policy.
 */
function csp(): Plugin {
  let serve = false;
  let server = '';
  return {
    name: 'csp-placeholders',
    configResolved(config) {
      serve = config.command === 'serve';
      server =
        loadEnv(config.mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL ?? '';
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html
          .replace(/__CSP_SERVER__/g, server.replace(/\/+$/, ''))
          .replace(/__CSP_DEV__/g, serve ? 'ws://127.0.0.1:5173' : '')
          .replace(/ {2,}/g, ' ');
      },
    },
  };
}

export default defineConfig({
  base: '/myOwnSpotifyData/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [csp()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
