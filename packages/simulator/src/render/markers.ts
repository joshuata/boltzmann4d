// Kind markers (KIND-9): a shape drawn over each particle's disc in a contrasting colour,
// so kinds stay distinguishable without colour (greyscale, colour-vision deficiencies,
// speed and energy colouring). Shapes are in units of the disc's radius, centred on it.
// Plain data, shared by the 2D view (view-2d.ts) and the sidebar's legend (KindSwatch).

export type MarkerShape =
  | { type: 'circle'; radius: number }
  | { type: 'polygon'; points: readonly (readonly [number, number])[] };

/** A bar from −len to +len along `angle` (radians), `width` across. */
function bar(len: number, width: number, angle: number): MarkerShape {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const corner = (u: number, v: number) => [u * c - v * s, u * s + v * c] as const;
  return {
    type: 'polygon',
    points: [corner(-len, -width), corner(len, -width), corner(len, width), corner(-len, width)],
  };
}

/** A regular polygon with `sides` corners at `radius`, the first at `angle` (radians). */
function regular(sides: number, radius: number, angle: number): MarkerShape {
  return {
    type: 'polygon',
    points: Array.from({ length: sides }, (_, k) => {
      const a = angle + (2 * Math.PI * k) / sides;
      return [radius * Math.cos(a), radius * Math.sin(a)] as const;
    }),
  };
}

function star(points: number, outer: number, inner: number): MarkerShape {
  return {
    type: 'polygon',
    points: Array.from({ length: 2 * points }, (_, k) => {
      const a = Math.PI / 2 + (Math.PI * k) / points;
      const r = k % 2 === 0 ? outer : inner;
      return [r * Math.cos(a), r * Math.sin(a)] as const;
    }),
  };
}

/** The shapes of each marker; `disk` is the plain disc (nothing drawn over it). */
export const MARKER_SHAPES: Record<string, readonly MarkerShape[]> = {
  disk: [],
  ring: [{ type: 'circle', radius: 0.55 }],
  dot: [{ type: 'circle', radius: 0.3 }],
  cross: [bar(0.62, 0.13, Math.PI / 4), bar(0.62, 0.13, -Math.PI / 4)],
  square: [regular(4, 0.55, Math.PI / 4)],
  diamond: [regular(4, 0.6, 0)],
  triangle: [regular(3, 0.6, Math.PI / 2)],
  plus: [bar(0.62, 0.13, 0), bar(0.62, 0.13, Math.PI / 2)],
  star: [star(5, 0.65, 0.27)],
  bar: [bar(0.62, 0.17, 0)],
};

/**
 * The marker's colour on a disc of colour `rgb`: near-black on light discs, white on dark
 * ones, whichever contrasts more.
 */
export function markerColor(r: number, g: number, b: number): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // Contrast against black (L + 0.05) / 0.05 vs white 1.05 / (L + 0.05): equal at L ≈ 0.179.
  return luminance > 0.179 ? 0x111111 : 0xffffff;
}
