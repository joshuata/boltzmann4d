// Offline support. SvelteKit registers this worker in production builds. On install it
// caches the whole site (the built app, the static files and every prerendered page), so
// after one visit every simulation and doc works without a network: useful on unreliable
// classroom wifi. A new deploy installs a new cache and deletes the old one.
// Type-checked by tsconfig.service-worker.json (WebWorker types, no DOM).
import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
import { self as sw } from '$app/service-worker';

const CACHE = `boltzmann4d-${version}`;
/** The site's root URL path, e.g. `/boltzmann4d/` on GitHub Pages (the worker's scope). */
const root = new URL(sw.registration.scope).pathname;
/** A manifest path (relative to the base path) as a URL path. */
const atRoot = (path: string) => root + path.replace(/^\//, '');
/** Everything the site is made of. Built files have hashed names, so they never change. */
const ASSETS = [...immutable, ...assets, ...prerendered].map(({ path }) => atRoot(path));
const assetSet = new Set(ASSETS);
/** Built files: their names change with their content, so a cached copy is always right. */
const immutableDir = atRoot('_app/immutable/');

sw.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

async function precache(): Promise<void> {
  const cache = await caches.open(CACHE);
  await cache.addAll(ASSETS);
  // The workers' chunks and preset files aren't in SvelteKit's manifest; the build lists
  // them in offline-files.json (list-offline-files.js). The dev server has no list; then
  // those files are still cached as they're used.
  const response = await fetch(atRoot('offline-files.json'));
  if (response.ok && response.headers.get('content-type')?.includes('json')) {
    const files = (await response.json()) as string[];
    await cache.addAll(files.map(atRoot));
  }
}

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      ),
  );
});

sw.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(respond(request, url));
});

async function respond(request: Request, url: URL): Promise<Response> {
  const cache = await caches.open(CACHE);

  // The site itself: from the cache, which install filled.
  if (assetSet.has(url.pathname) || url.pathname.startsWith(immutableDir)) {
    const cached = await cache.match(url.pathname);
    if (cached) return cached;
  }

  // Anything else: the network first, then whatever the cache has.
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') void cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Offline on a page that wasn't prerendered (e.g. with a query): every page is the same
    // client-rendered shell, so the home page's shell can route to it.
    if (request.mode === 'navigate') {
      const shell = await cache.match(root);
      if (shell) return shell;
    }
    throw error;
  }
}
