// Runs after `vite build`: lists the files the service worker must cache that SvelteKit's
// manifest leaves out (the physics and render workers' own chunks and the preset files they
// load), and writes them to offline-files.json for src/service-worker.ts: in build/ (the
// deployed site) and in .svelte-kit/output/client/ (what `vite preview` serves).
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const buildDir = join(import.meta.dirname, 'build');
const workersDir = join(buildDir, '_app/immutable/workers');

const files = readdirSync(workersDir, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => relative(buildDir, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
  .sort();

for (const dir of [buildDir, join(import.meta.dirname, '.svelte-kit/output/client')]) {
  if (existsSync(dir)) writeFileSync(join(dir, 'offline-files.json'), JSON.stringify(files));
}
console.log(`offline-files.json: ${files.length} worker files`);
