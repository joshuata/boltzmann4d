// What the simulator needs from the browser: a physics worker, and WebGL 2 for Three.js
// (on an OffscreenCanvas in the render worker, or on the page as the fallback).

/** Names of the features this browser lacks, or an empty list if it can run the simulator. */
export function missingBrowserFeatures(): string[] {
  const missing: string[] = [];
  if (typeof Worker === 'undefined') missing.push('Web Workers');
  if (!hasWebGl2()) missing.push('WebGL 2');
  return missing;
}

function hasWebGl2(): boolean {
  try {
    const context = document.createElement('canvas').getContext('webgl2');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return context !== null;
  } catch {
    return false;
  }
}
