import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

/** GitHub Pages serves the site from https://joshuata.github.io/boltzmann4d/. */
const PAGES_BASE = '/boltzmann4d';

export default defineConfig(({ command, isPreview }) => ({
  plugins: [
    tailwindcss(),
    sveltekit({
      preprocess: vitePreprocess(),
      // Every page is prerendered to static files; there is no server.
      adapter: adapter({ fallback: '404.html' }),
      // The dev server stays at `/`; production builds and `vite preview` use the Pages path.
      paths: { base: command === 'build' || isPreview ? PAGES_BASE : '' },
    }),
  ],
  // SvelteKit limits the dev server to apps/web; the workspace packages (and the preset
  // .set files they import with `?raw`) live above it.
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd())] } },
  worker: { format: 'es' },
}));
