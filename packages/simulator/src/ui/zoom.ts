// Zoom levels (CTRL-7). 1 (100%) fits the whole arena in the canvas, the web port's
// default; the Java app's 100% was 1 pixel per nm instead. Zoom is about the arena's centre.

/** The smallest zoom: a third of the fitted size (the Java app's 33% minimum). */
export const MIN_ZOOM = 1 / 3;
/** The largest zoom, 1600%: particles are then a good part of the screen. */
export const MAX_ZOOM = 16;
/** One button or key step: about 25% (the Java app's zoom steps). */
export const ZOOM_STEP = 1.25;

/** Keeps a zoom within MIN_ZOOM..MAX_ZOOM (non-finite values fall back to fit). */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * The next zoom one step in (`direction` 1) or out (-1). Steps land on powers of 1.25, so
 * stepping in and out again returns to 100%, and a typed zoom snaps to the next level.
 */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const level = Math.log(zoom) / Math.log(ZOOM_STEP);
  // Round away tiny float errors so 125% steps to 156%, not to 125% again.
  const rounded = Math.round(level);
  const at = Math.abs(level - rounded) < 1e-6 ? rounded : level;
  const next = direction > 0 ? Math.floor(at) + 1 : Math.ceil(at) - 1;
  return clampZoom(ZOOM_STEP ** next);
}

/** The zoom as a whole percentage, e.g. "125%". */
export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

/** Reads a typed percentage ("150", "150%", " 80 % "); null if it isn't a positive number. */
export function parseZoom(text: string): number | null {
  const value = Number(text.trim().replace(/%$/, '').trim());
  return Number.isFinite(value) && value > 0 ? clampZoom(value / 100) : null;
}
