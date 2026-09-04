/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base: '/myOwnSpotifyData/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
