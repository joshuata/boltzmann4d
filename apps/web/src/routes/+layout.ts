// The simulator needs workers, OffscreenCanvas and WebGL, so pages render only in the
// browser. Each route is still prerendered to its own HTML shell for GitHub Pages.
export const ssr = false;
export const prerender = true;
