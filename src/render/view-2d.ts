// 1D/2D view: orthographic camera over the arena, one instanced circle per particle.
// Periodic arenas draw each disc's wrapped images, clipped to the box. Trace mode
// accumulates particle marks in an off-screen target drawn behind the particles.
import * as THREE from 'three';
import type { RenderFrame, SceneInfo } from '../sim';
import { periodicImages } from './periodic-images';
import { disposeTree, NM, ParticleColors, type View } from './view';

/** Space around the arena, as a fraction of its larger side. */
const MARGIN = 0.04;
/** Piston fill: Java's (LwjglRenderSurface pistonColor, Color.GRAY). */
const PISTON_COLOR = 0x808080;

export function createView2D(info: SceneInfo): View {
  const arena = { x: info.arenaXSize * NM, y: info.arenaYSize * NM };
  const root = new THREE.Group();
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);

  root.add(
    new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(arena.x, 0, 0),
        new THREE.Vector3(arena.x, arena.y, 0),
        new THREE.Vector3(0, arena.y, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff }),
    ),
  );
  const plug = info.divider ? addDivider(root, info.divider, arena.y) : null;
  const placePiston = info.piston ? addPiston(root, info.piston, arena) : null;
  placePiston?.(arena.y);

  const count = info.radii.length;
  const radii = info.radii;
  const periodic = info.periodic && info.dimension === 2;
  const material = new THREE.MeshBasicMaterial();
  // Clip to the box so the wrapped images (and the discs they copy) stop at its edges.
  const clipping = periodic
    ? [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), arena.x),
        new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
        new THREE.Plane(new THREE.Vector3(0, -1, 0), arena.y),
      ]
    : null;
  material.clippingPlanes = clipping;
  // A disc has up to four images in a periodic box (itself, two edges, the corner).
  const capacity = periodic ? 4 * count : count;
  const particles = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1, 32), // scaled per instance by radius
    material,
    capacity,
  );
  particles.count = 0; // nothing to draw until the first frame
  particles.setColorAt(0, new THREE.Color()); // allocate instance colours
  root.add(particles);

  const colors = new ParticleColors(info);
  const trace = createTrace(capacity, camera, clipping);
  root.add(trace.layer);
  if (info.trace?.enabled) trace.setEnabled(true, info.trace.pointSize);

  const images = new Float64Array(8);
  const matrix = new THREE.Matrix4();
  let lastTime = -Infinity;

  return {
    root,
    camera,
    fit(aspect) {
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
      trace.reset(); // the marks no longer line up
    },
    display(frame: RenderFrame) {
      if (frame.pistonY !== undefined) placePiston?.(frame.pistonY * NM);
      if (plug && frame.holeOpen !== undefined) plug.visible = !frame.holeOpen;
      // The simulation went back in time: it restarted, so start the trace afresh.
      if (frame.time < lastTime) trace.reset();
      lastTime = frame.time;
      const d = frame.dimension;
      const n = Math.min(frame.types.length, count);
      let drawn = 0;
      for (let i = 0; i < n; i++) {
        const color = colors.of(frame, i);
        const x = (frame.positions[i * d] ?? 0) * NM;
        const y = d > 1 ? (frame.positions[i * d + 1] ?? 0) * NM : 0;
        const r = (radii[i] ?? 0) * NM;
        const k = periodic ? periodicImages(x, y, r, arena.x, arena.y, images) : 1;
        for (let m = 0; m < k; m++) {
          const ix = periodic ? images[2 * m]! : x;
          const iy = periodic ? images[2 * m + 1]! : y;
          matrix.makeScale(r, r, 1).setPosition(ix, iy, 0);
          particles.setColorAt(drawn, color);
          particles.setMatrixAt(drawn, matrix);
          trace.mark(drawn, ix, iy, color);
          drawn++;
        }
      }
      particles.count = drawn;
      particles.instanceMatrix.needsUpdate = true;
      if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
      trace.marked(drawn);
    },
    rotate() {},
    setColorMode(mode) {
      colors.mode = mode;
    },
    setTrace(enabled, pointSize) {
      trace.setEnabled(enabled, pointSize);
    },
    beforeRender(renderer) {
      trace.draw(renderer);
    },
    dispose() {
      particles.dispose();
      trace.dispose();
      disposeTree(root);
    },
  };
}

/**
 * Trace mode (CoreProfileRenderer's trace history): each new frame adds a mark of
 * `pointSize` pixels at every particle (and periodic image) to an off-screen target,
 * which is drawn behind the particles. It clears when turned off, on resize and when
 * the simulation restarts.
 */
function createTrace(
  capacity: number,
  camera: THREE.OrthographicCamera,
  clipping: THREE.Plane[] | null,
) {
  const positions = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const pointsMaterial = new THREE.PointsMaterial({
    size: 2,
    sizeAttenuation: false,
    vertexColors: true,
  });
  pointsMaterial.clippingPlanes = clipping;
  const points = new THREE.Points(geometry, pointsMaterial);
  const marks = new THREE.Scene();
  marks.add(points);

  // The accumulated marks, as a quad covering the camera's view, behind everything.
  const layerMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  const layer = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), layerMaterial);
  layer.renderOrder = -1;
  layer.visible = false;

  let target: THREE.WebGLRenderTarget | null = null;
  let enabled = false;
  let pointSize = 2;
  let pending = false; // new marks waiting to be drawn into the target
  let clearNeeded = true;
  const clearColor = new THREE.Color();

  return {
    layer,
    setEnabled(on: boolean, size: number) {
      enabled = on;
      pointSize = size > 0 ? size : 2;
      layer.visible = on;
      clearNeeded = true;
    },
    reset() {
      clearNeeded = true;
    },
    mark(index: number, x: number, y: number, color: THREE.Color) {
      if (!enabled) return;
      positions[3 * index] = x;
      positions[3 * index + 1] = y;
      positions[3 * index + 2] = 0;
      colors[3 * index] = color.r;
      colors[3 * index + 1] = color.g;
      colors[3 * index + 2] = color.b;
    },
    marked(count: number) {
      if (!enabled) return;
      geometry.setDrawRange(0, count);
      geometry.attributes.position!.needsUpdate = true;
      geometry.attributes.color!.needsUpdate = true;
      pending = true;
    },
    draw(renderer: THREE.WebGLRenderer) {
      if (!enabled) return;
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      if (!target || target.width !== size.x || target.height !== size.y) {
        target?.dispose();
        target = new THREE.WebGLRenderTarget(size.x, size.y);
        layerMaterial.map = target.texture;
        layerMaterial.needsUpdate = true;
        clearNeeded = true;
      }
      // Cover the camera's view with the layer.
      layer.scale.set(camera.right - camera.left, camera.top - camera.bottom, 1);
      layer.position.set((camera.left + camera.right) / 2, (camera.bottom + camera.top) / 2, -0.5);
      if (!clearNeeded && !pending) return;
      const previousTarget = renderer.getRenderTarget();
      const previousAutoClear = renderer.autoClear;
      renderer.getClearColor(clearColor);
      const previousAlpha = renderer.getClearAlpha();
      renderer.setRenderTarget(target);
      if (clearNeeded) {
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        clearNeeded = false;
      }
      if (pending) {
        pointsMaterial.size = pointSize * renderer.getPixelRatio();
        renderer.autoClear = false;
        renderer.render(marks, camera);
        pending = false;
      }
      renderer.setRenderTarget(previousTarget);
      renderer.autoClear = previousAutoClear;
      renderer.setClearColor(clearColor, previousAlpha);
    },
    dispose() {
      target?.dispose();
      geometry.dispose();
      pointsMaterial.dispose();
    },
  };
}

/**
 * The divider as filled bars (in nanometres), with a gap for the hole and the two edge
 * discs that line it. With Maxwell's demon, a plug fills the gap while the hole is
 * closed (CoreProfileRenderer draws the divider solid then); it is returned.
 */
function addDivider(
  root: THREE.Group,
  info: NonNullable<SceneInfo['divider']>,
  arenaHeight: number,
): THREE.Mesh | null {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const left = info.leftX * NM;
  const width = (info.rightX - info.leftX) * NM;
  const bar = (from: number, to: number) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, Math.max(0, to - from)), material);
    mesh.position.set(left + width / 2, (from + to) / 2, 0);
    if (to > from) group.add(mesh);
    return mesh;
  };
  let plug: THREE.Mesh | null = null;
  if (info.edgeY && info.edgeY.length === 2) {
    const top = info.edgeY[0]! * NM;
    const bottom = info.edgeY[1]! * NM;
    bar(0, bottom);
    bar(top, arenaHeight);
    for (const y of [top, bottom]) {
      const edge = new THREE.Mesh(new THREE.CircleGeometry(info.edgeRadius * NM, 24), material);
      edge.position.set(left + width / 2, y, 0);
      group.add(edge);
    }
    if (info.demon) {
      plug = bar(bottom, top);
      plug.visible = true; // the demon's hole starts closed
    }
  } else {
    bar(0, arenaHeight);
  }
  root.add(group);
  return plug;
}

/**
 * The piston as Java draws it (CoreProfileRenderer.addPiston2D): a slab two valve radii
 * thick under its face, and a shaft up from its middle, clipped to the arena. Returns a
 * function that moves it to height `y` (nm).
 */
function addPiston(
  root: THREE.Group,
  piston: NonNullable<SceneInfo['piston']>,
  arena: { x: number; y: number },
): (y: number) => void {
  const material = new THREE.MeshBasicMaterial({ color: PISTON_COLOR });
  const square = new THREE.PlaneGeometry(1, 1);
  const valve = new THREE.Mesh(square, material);
  const shaft = new THREE.Mesh(square, material);
  root.add(valve, shaft);
  return (y) => {
    const top = arena.y;
    const valveTop = Math.min(y + 2 * piston.valveRadius * NM, top);
    valve.visible = valveTop > y;
    valve.scale.set(arena.x, valveTop - y, 1);
    valve.position.set(arena.x / 2, (y + valveTop) / 2, 0);
    shaft.visible = top > valveTop;
    shaft.scale.set(2 * piston.shaftRadius * NM, top - valveTop, 1);
    shaft.position.set(arena.x / 2, (valveTop + top) / 2, 0);
  };
}
