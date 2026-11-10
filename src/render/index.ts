import * as THREE from 'three';
import type { RenderFrame, SceneInfo } from '../sim';

export interface Renderer {
  /** Sets up the arena and particles; call before frames arrive (and again on reload). */
  setScene(scene: SceneInfo): void;
  /** Queues a frame; it is drawn on the next animation tick (MainGuiView.setNextFrameToDisplay). */
  setNextFrameToDisplay(frame: RenderFrame): void;
  dispose(): void;
}

/** The scene is drawn in nanometres: simulation meters are ~1e-8, awkward for float32. */
const NM = 1e9;
/** Space around the arena, as a fraction of its larger side. */
const MARGIN = 0.04;

/**
 * 2D view: orthographic camera over the arena, one instanced circle per particle.
 * Will grow into the 1D/2D/3D renderer described in boltzmann3d docs/rendering-baseline.md
 * (periodic ghosts, colour modes, trace). Keeps rendering while the simulation is paused.
 */
export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);

  const wallMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
  const circle = new THREE.CircleGeometry(1, 32); // scaled per instance by radius
  const particleMaterial = new THREE.MeshBasicMaterial();
  let walls: THREE.LineLoop | null = null;
  let particles: THREE.InstancedMesh | null = null;
  let radii: Float64Array = new Float64Array(0);
  let arena = { x: 1, y: 1 };
  let nextFrame: RenderFrame | null = null;
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();

  const fitCamera = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
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

  const observer = new ResizeObserver(fitCamera);
  observer.observe(canvas);
  fitCamera();

  renderer.setAnimationLoop(() => {
    if (nextFrame) {
      displayFrame(nextFrame);
      nextFrame = null;
    }
    renderer.render(scene, camera);
  });

  return {
    setScene,
    setNextFrameToDisplay(frame) {
      nextFrame = frame;
    },
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      walls?.geometry.dispose();
      particles?.dispose();
      circle.dispose();
      particleMaterial.dispose();
      wallMaterial.dispose();
      renderer.dispose();
    },
  };
}
