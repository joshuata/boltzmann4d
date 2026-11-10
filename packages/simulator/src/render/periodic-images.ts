// Periodic arenas: a disc or sphere crossing an edge of the box also shows, wrapped, on the
// opposite side. The engine keeps such a particle on the low side (centre in [-r, r)), so
// without its images it hangs outside the box.

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

/**
 * 3D version of periodicImages: writes x, y, z triples into `out` (room for 8) for a sphere
 * of radius `r` at (x, y, z) in a periodic X × Y × Z box, one per combination of the faces
 * it crosses. Returns how many centres were written (1–8).
 */
export function periodicImages3D(
  x: number,
  y: number,
  z: number,
  r: number,
  X: number,
  Y: number,
  Z: number,
  out: Float64Array,
): number {
  const dx = x < r ? X : x > X - r ? -X : 0;
  const dy = y < r ? Y : y > Y - r ? -Y : 0;
  const dz = z < r ? Z : z > Z - r ? -Z : 0;
  let n = 0;
  for (const sz of dz === 0 ? [0] : [0, dz]) {
    for (const sy of dy === 0 ? [0] : [0, dy]) {
      for (const sx of dx === 0 ? [0] : [0, dx]) {
        out[3 * n] = x + sx;
        out[3 * n + 1] = y + sy;
        out[3 * n + 2] = z + sz;
        n++;
      }
    }
  }
  return n;
}
