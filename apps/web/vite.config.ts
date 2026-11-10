import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { execSync } from 'node:child_process';
import { mdsvex } from 'mdsvex';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

/** GitHub Pages serves the site from https://joshuata.github.io/boltzmann4d/. */
const PAGES_BASE = '/boltzmann4d';

/** The commit the site is built from, shown in About (empty outside a git checkout). */
function commit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

export default defineConfig(({ command, isPreview }) => ({
  plugins: [
    tailwindcss(),
    sveltekit({
      // Pages and docs may be written in Markdown (mdsvex), e.g. src/docs/*.md.
      extensions: ['.svelte', '.md'],
      preprocess: [vitePreprocess(), mdsvex({ extensions: ['.md'] })],
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
  define: {
    'import.meta.env.BUILD_COMMIT': JSON.stringify(commit()),
    'import.meta.env.BUILD_DATE': JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
}));
