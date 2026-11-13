// 1D arenas are a line, drawn as a lane with the particles on its midline (as Java's
// renderer did). The lane's height is only for drawing: the physics has no y.

/** The height (m) to draw a 1D arena of length `xSize` with particles of these radii. */
export function laneHeight(xSize: number, radii: ArrayLike<number>): number {
  let largest = 0;
  for (let k = 0; k < radii.length; k++) largest = Math.max(largest, radii[k]!);
  return Math.max(xSize / 10, 4 * largest);
}
