// The Color by Speed / Color by KE scale (VIEW-4), shared by the renderer and the
// statistics chart's bars (STAT-7). Pure: no Three.js, no DOM.
//
// Within [min, max] the hue runs from blue-violet (0.7) at min to red (0) at max, at full
// saturation and lightness ½ (Java's HSB with full brightness); below min is dark blue
// and above max dark red.

export interface HeatColor {
  /** Hue, 0–1. */
  h: number;
  /** HSL saturation and lightness, 0–1. */
  s: number;
  l: number;
}

const MAX_HUE = 0.7;

export function heatColor(value: number, min: number, max: number): HeatColor {
  if (value < min) return { h: MAX_HUE, s: 1, l: 0.25 };
  if (value > max) return { h: 0, s: 1, l: 0.25 };
  const span = max - min;
  const fraction = span > 0 ? (max - value) / span : 0;
  return { h: MAX_HUE * fraction, s: 1, l: 0.5 };
}

/** The same as a CSS colour. */
export function heatCss(value: number, min: number, max: number): string {
  const { h, s, l } = heatColor(value, min, max);
  return `hsl(${(h * 360).toFixed(1)} ${s * 100}% ${l * 100}%)`;
}
