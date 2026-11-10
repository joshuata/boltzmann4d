import * as THREE from 'three';
import type { RenderFrame, SceneInfo } from '../sim';

/** Drawing-buffer size: CSS pixels plus the device pixel ratio. */
export interface ViewSize {
  width: number;
  height: number;
  pixelRatio: number;
}

export interface Renderer {
  /** Sets up the arena and particles; call before frames arrive (and again on reload). */
  setScene(scene: SceneInfo): void;
  /** The canvas's on-screen size changed. */
  setSize(size: ViewSize): void;
  /** Queues a frame; it is drawn on the next animation tick (MainGuiView.setNextFrameToDisplay). */
  setNextFrameToDisplay(frame: RenderFrame): void;
  dispose(): void;
}

/** The scene is drawn in nanometres: simulation meters are ~1e-8, awkward for float32. */
const NM = 1e9;
/** Space around the arena, as a fraction of its larger side. */
const MARGIN = 0.04;

// Schedules a draw for the next display refresh. Dedicated workers have
// requestAnimationFrame in current browsers; fall back to a ~60 Hz timer.
const requestDraw: (draw: () => void) => void =
  typeof requestAnimationFrame === 'function'
    ? (draw) => void requestAnimationFrame(draw)
    : (draw) => void setTimeout(draw, 16);

/**
 * 2D view: orthographic camera over the arena, one instanced circle per particle.
 * Will grow into the 1D/2D/3D renderer described in boltzmann3d docs/rendering-baseline.md
 * (periodic ghosts, colour modes, trace).
 *
 * Uses no DOM APIs, so it runs on an OffscreenCanvas in the render worker as well as on
 * the main thread. It only draws when something changed (a frame, the scene or the size),
 * at most once per display refresh.
 */
export function createRenderer(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  initialSize: ViewSize,
): Renderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);

  const wallMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
  const circle = new THREE.CircleGeometry(1, 32); // scaled per instance by radius
  const particleMaterial = new THREE.MeshBasicMaterial();
  let walls: THREE.LineLoop | null = null;
  const dividerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  let divider: THREE.Group | null = null;
  let particles: THREE.InstancedMesh | null = null;
  let radii: Float64Array = new Float64Array(0);
  let arena = { x: 1, y: 1 };
  let nextFrame: RenderFrame | null = null;
  let size = initialSize;
  let drawScheduled = false;
  let disposed = false;
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();

  const fitCamera = () => {
    const { width: w, height: h } = size;
    renderer.setPixelRatio(size.pixelRatio);
    renderer.setSize(w, h, false);
    const aspect = w / h || 1;
    const margin = MARGIN * Math.max(arena.x, arena.y);
    let halfW = arena.x / 2 + margin;
    let halfH = arena.y / 2 + margin;
    if (halfW / halfH < aspect) halfW = halfH * aspect;
    else halfH = halfW / aspect;
    camera.left = arena.x / 2 - halfW;
    camera.right = arena.x / 2 + halfW;
    camera.bottom = arena.y / 2 - halfH;
    camera.top = arena.y / 2 + halfH;
    camera.updateProjectionMatrix();
  };

  const setScene = (info: SceneInfo) => {
    arena = { x: info.arenaXSize * NM, y: info.arenaYSize * NM };
    if (walls) {
      scene.remove(walls);
      walls.geometry.dispose();
    }
    walls = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(arena.x, 0, 0),
        new THREE.Vector3(arena.x, arena.y, 0),
        new THREE.Vector3(0, arena.y, 0),
      ]),
      wallMaterial,
    );
    scene.add(walls);

    if (divider) {
      scene.remove(divider);
      divider.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      divider = null;
    }
    if (info.divider) divider = buildDivider(info.divider, arena.y, dividerMaterial);
    if (divider) scene.add(divider);

    if (particles) {
      scene.remove(particles);
      particles.dispose();
    }
    const count = info.radii.length;
    radii = info.radii;
    particles = new THREE.InstancedMesh(circle, particleMaterial, count);
    particles.count = 0; // nothing to draw until the first frame
    for (let i = 0; i < count; i++) {
      particles.setColorAt(i, color.setHex(info.typeColors[info.types[i] ?? 0] ?? 0xffffff));
    }
    scene.add(particles);
    fitCamera();
    scheduleDraw();
  };

  const displayFrame = (frame: RenderFrame) => {
    if (!particles) return;
    const d = frame.dimension;
    const count = Math.min(frame.types.length, radii.length);
    for (let i = 0; i < count; i++) {
      const x = (frame.positions[i * d] ?? 0) * NM;
      const y = d > 1 ? (frame.positions[i * d + 1] ?? 0) * NM : 0;
      const r = (radii[i] ?? 0) * NM;
      matrix.makeScale(r, r, 1).setPosition(x, y, 0);
      particles.setMatrixAt(i, matrix);
    }
    particles.count = count;
    particles.instanceMatrix.needsUpdate = true;
  };

  const draw = () => {
    drawScheduled = false;
    if (disposed) return;
    if (nextFrame) {
      displayFrame(nextFrame);
      nextFrame = null;
    }
    renderer.render(scene, camera);
  };
  function scheduleDraw() {
    if (drawScheduled || disposed) return;
    drawScheduled = true;
    requestDraw(draw);
  }

  fitCamera();
  scheduleDraw();

  return {
    setScene,
    setSize(next) {
      size = next;
      fitCamera();
      scheduleDraw();
    },
    setNextFrameToDisplay(frame) {
      nextFrame = frame; // only the latest frame is drawn if several arrive between refreshes
      scheduleDraw();
    },
    dispose() {
      disposed = true;
      walls?.geometry.dispose();
      particles?.dispose();
      circle.dispose();
      particleMaterial.dispose();
      divider?.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      dividerMaterial.dispose();
      wallMaterial.dispose();
      renderer.dispose();
    },
  };
}

/**
 * The divider as filled bars (in nanometres), with a gap for the hole and the two edge
 * discs that line it.
 */
function buildDivider(
  info: NonNullable<SceneInfo['divider']>,
  arenaHeight: number,
  material: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();
  const left = info.leftX * NM;
  const width = (info.rightX - info.leftX) * NM;
  const bar = (from: number, to: number) => {
    if (to <= from) return;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, to - from), material);
    mesh.position.set(left + width / 2, (from + to) / 2, 0);
    group.add(mesh);
  };
  if (info.edgeY) {
    const [top, bottom] = info.edgeY.map((y) => y * NM) as [number, number];
    bar(0, bottom);
    bar(top, arenaHeight);
    for (const y of [top, bottom]) {
      const edge = new THREE.Mesh(new THREE.CircleGeometry(info.edgeRadius * NM, 24), material);
      edge.position.set(left + width / 2, y, 0);
      group.add(edge);
    }
  } else {
    bar(0, arenaHeight);
  }
  return group;
}
