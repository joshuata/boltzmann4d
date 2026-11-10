// Periodic arenas: a disc crossing an edge of the box also shows, wrapped, on the opposite
// side. The engine keeps such a disc on the low side (centre in [-r, r)), so without its
// images it hangs outside the box.

/**
 * Writes into `out` the centres (x, y pairs) at which to draw a disc of radius `r` centred
 * at (x, y) in a periodic X × Y box: the disc itself plus a copy for each edge it crosses
 * (and the corner copy when it crosses two). Returns how many centres were written (1–4).
 */
export function periodicImages(
  x: number,
  y: number,
  r: number,
  X: number,
  Y: number,
  out: Float64Array,
): number {
  const dx = x < r ? X : x > X - r ? -X : 0;
  const dy = y < r ? Y : y > Y - r ? -Y : 0;
  out[0] = x;
  out[1] = y;
  let n = 1;
  if (dx !== 0) {
    out[2 * n] = x + dx;
    out[2 * n + 1] = y;
    n++;
  }
  if (dy !== 0) {
    out[2 * n] = x;
    out[2 * n + 1] = y + dy;
    n++;
  }
  if (dx !== 0 && dy !== 0) {
    out[2 * n] = x + dx;
    out[2 * n + 1] = y + dy;
    n++;
  }
  return n;
}
