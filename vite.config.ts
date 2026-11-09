import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/** GitHub Pages serves the site from https://joshuata.github.io/boltzmann4d/. */
const PAGES_BASE = '/boltzmann4d/';

export default defineConfig(({ command, isPreview }) => ({
  // The dev server stays at `/`; production builds and `vite preview` use the Pages path.
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  plugins: [svelte()],
  worker: { format: 'es' },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}));
