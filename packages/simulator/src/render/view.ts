// What the renderer needs from a 1D/2D or 3D view of the arena (view-2d.ts, view-3d.ts).
import * as THREE from 'three';
import type { ColorLimits, ColorMode, RenderFrame, SceneInfo } from '@boltzmann4d/engine/sim';
import { heatColor } from './color-scale';

/** The scene is drawn in nanometres: simulation meters are ~1e-8, awkward for float32. */
export const NM = 1e9;

/** The arena's colour scheme (VIEW-1), which follows the site's light or dark theme. */
export type ArenaTheme = 'dark' | 'light';

/**
 * VIEW-1's arena colours: a black arena with white edges, or a white one with grey edges.
 * Particle and wall colours stand out against both (KIND-8, WALL-5).
 */
export const ARENA_COLORS: Record<ArenaTheme, { background: number; edge: number }> = {
  dark: { background: 0x000000, edge: 0xffffff },
  light: { background: 0xffffff, edge: 0x808080 },
};

export interface View {
  /** Everything the view draws, added to the renderer's scene. */
  readonly root: THREE.Object3D;
  readonly camera: THREE.Camera;
  /**
   * Fits the camera to a drawing area of this aspect ratio (width / height), magnified by
   * `zoom` about the arena's centre (1 shows the whole arena; CTRL-7).
   */
  fit(aspect: number, zoom: number): void;
  /** Places the particles where the frame has them. */
  display(frame: RenderFrame): void;
  /** Turns the view by these angles in degrees (3D only; 2D views ignore it). */
  rotate(aboutX: number, aboutY: number): void;
  /** How particles are coloured from the next frame on. */
  setColorMode(mode: ColorMode): void;
  /** Trace mode (VIEW-5): accumulate particle dots of `pointSize` pixels; off clears them. */
  setTrace(enabled: boolean, pointSize: number): void;
  /** Erases the trace drawn so far; tracing carries on if it's on. */
  clearTrace(): void;
  /** The Color by Speed / KE scale's limits (VIEW-4), from the next frame on. */
  setColorLimits?(limits: ColorLimits): void;
  /** Whether kinds' markers are drawn over their particles (KIND-9; 2D only). */
  setMarkers?(enabled: boolean): void;
  /** Recolours the arena's edges for a light or dark background (2D only). */
  setTheme?(theme: ArenaTheme): void;
  /** Called before each draw, with the renderer (the trace draws into its own target). */
  beforeRender?(renderer: THREE.WebGLRenderer): void;
  dispose(): void;
}

/** kg per amu, and J → kJ/mol (Units: 1e3 / Avogadro J per kJ/mol). */
const AMU_KG = 1.660538782e-27;
const KJ_PER_MOL = 1.0e3 / 6.02214179e23;

/**
 * Each particle's colour (MainGuiFullView's colourers): its type's colour (which
 * reactions change), or for SPEED and KE the heat scale over the matching plot's limits
 * (color-scale.ts, VIEW-4).
 */
export class ParticleColors {
  mode: ColorMode;
  limits: ColorLimits | undefined;
  private readonly palette: THREE.Color[];
  private readonly masses: Float64Array | undefined;
  private readonly color = new THREE.Color();

  constructor(info: SceneInfo) {
    this.palette = info.typeColors.map((c) => new THREE.Color(c));
    this.masses = info.masses;
    this.limits = info.colorLimits;
    this.mode = info.colorMode ?? 'NORMAL';
  }

  /** The colour particle i shows in this frame (a shared object; copy it to keep it). */
  of(frame: RenderFrame, i: number): THREE.Color {
    const mode = this.mode;
    const limits = this.limits;
    if (mode === 'NORMAL' || !limits || !frame.speeds) {
      return this.palette[frame.types[i]!] ?? this.palette[0]!;
    }
    const speed = frame.speeds[i]!;
    let value = speed;
    let [min, max] = limits.speed;
    if (mode === 'KE') {
      const mass = (this.masses?.[i] ?? 0) * AMU_KG;
      value = (0.5 * mass * speed * speed) / KJ_PER_MOL;
      [min, max] = limits.energy;
    }
    const { h, s, l } = heatColor(value, min, max);
    return this.color.setHSL(h, s, l);
  }
}

/** Disposes every geometry and material under `root`. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}
