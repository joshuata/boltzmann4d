// How drawn walls look by default (WALL-5): each kind of wall has its own colour and dash,
// so kinds are recognisable without relying on colour alone (gates are dashed). Default
// colours keep at least 3:1 contrast with both arena backgrounds (black and white), which
// wall-styles.test.ts checks. Styles are display only.
import type { WALL_KINDS } from './schema';

export type WallKindType = (typeof WALL_KINDS)[number];

export interface ResolvedWallStyle {
  /** 0xRRGGBB. */
  color: number;
  /** Screen pixels. */
  lineWidth: number;
  dash: 'solid' | 'dashed';
}

export const DEFAULT_WALL_STYLES: Record<WallKindType, ResolvedWallStyle> = {
  // Mid grey: plain walls stay quiet next to the particles.
  reflecting: { color: 0x8c8c8c, lineWidth: 3, dash: 'solid' },
  // Okabe–Ito vermilion: warm, for walls held at a temperature.
  thermal: { color: 0xd55e00, lineWidth: 3, dash: 'solid' },
  // Okabe–Ito bluish green, thinner: a wall some particles pass through.
  semipermeable: { color: 0x009e73, lineWidth: 2, dash: 'solid' },
  // Okabe–Ito blue, dashed: a wall that opens.
  gate: { color: 0x0072b2, lineWidth: 3, dash: 'dashed' },
  // Okabe–Ito reddish purple, thick: a wall with a well along it.
  attractive: { color: 0xcc79a7, lineWidth: 4, dash: 'solid' },
};

/** A wall's style: its own settings, falling back to its kind's default. */
export function wallStyle(
  kind: WallKindType,
  style: { color?: string; lineWidth?: number; dash?: 'solid' | 'dashed' },
): ResolvedWallStyle {
  const base = DEFAULT_WALL_STYLES[kind];
  return {
    color: style.color !== undefined ? parseInt(style.color.slice(1), 16) : base.color,
    lineWidth: style.lineWidth ?? base.lineWidth,
    dash: style.dash ?? base.dash,
  };
}

/** WCAG relative luminance of a 0xRRGGBB colour. */
export function relativeLuminance(rgb: number): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((rgb >> 16) & 0xff) +
    0.7152 * channel((rgb >> 8) & 0xff) +
    0.0722 * channel(rgb & 0xff)
  );
}

/** WCAG contrast ratio between two colours (1 to 21). */
export function contrastRatio(a: number, b: number): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
