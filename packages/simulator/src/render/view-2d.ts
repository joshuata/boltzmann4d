// 1D/2D view: orthographic camera over the arena, one instanced circle per particle.
// Periodic arenas draw each disc's wrapped images, clipped to the box. Trace mode
// accumulates particle marks in an off-screen target drawn behind the particles. Drawn
// walls are lines of a fixed width in pixels (WALL-5), and each kind's marker is drawn
// over its particles (KIND-9).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { RenderFrame, SceneInfo } from '@boltzmann4d/engine/sim';
import { MARKER_SHAPES, markerColor, type MarkerShape } from './markers';
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
  const { materials: wallMaterials, gates } = addWalls(root, info.walls ?? [], arena);
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

  const markers = createMarkers(info, capacity, clipping);
  root.add(markers.group);

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
      // Open gates fade (WALL-4).
      if (frame.openGates) {
        for (const [w, material] of gates)
          material.opacity = frame.openGates.includes(w) ? 0.25 : 1;
      }
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
          markers.place(frame.types[i]!, matrix, color);
          trace.mark(drawn, ix, iy, color);
          drawn++;
        }
      }
      particles.count = drawn;
      markers.done();
      particles.instanceMatrix.needsUpdate = true;
      if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
      trace.marked(drawn);
    },
    rotate() {},
    setColorMode(mode) {
      colors.mode = mode;
    },
    setColorLimits(limits) {
      colors.limits = limits;
    },
    setTrace(enabled, pointSize) {
      trace.setEnabled(enabled, pointSize);
    },
    setMarkers(enabled) {
      markers.group.visible = enabled;
    },
    beforeRender(renderer) {
      if (wallMaterials.length > 0) {
        const size = renderer.getSize(new THREE.Vector2());
        for (const material of wallMaterials) material.resolution.copy(size);
      }
      trace.draw(renderer);
    },
    dispose() {
      particles.dispose();
      markers.dispose();
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

/**
 * Drawn walls (WALL-5): each a line `lineWidth` pixels wide in its colour, dashed or solid,
 * and attractive walls' wells as a faint band of the well's width each side. Returns the
 * materials (which need the drawing size to draw widths in pixels) and the gates'.
 */
function addWalls(
  root: THREE.Group,
  walls: NonNullable<SceneInfo['walls']>,
  arena: { x: number; y: number },
): { materials: LineMaterial[]; gates: Map<number, LineMaterial> } {
  const dash = 0.012 * Math.max(arena.x, arena.y); // nm
  const materials: LineMaterial[] = [];
  const gates = new Map<number, LineMaterial>();
  walls.forEach((wall, w) => {
    const positions: number[] = [];
    const n = wall.points.length / 2;
    for (let k = 0; k <= (wall.closed ? n : n - 1); k++) {
      const m = k % n;
      positions.push(wall.points[2 * m]! * NM, wall.points[2 * m + 1]! * NM, 0.1);
    }
    const geometry = new LineGeometry();
    geometry.setPositions(positions);
    if (wall.well) {
      const band = new LineMaterial({
        color: wall.color,
        linewidth: 2 * wall.well * NM,
        worldUnits: true,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      });
      const well = new Line2(geometry, band);
      well.renderOrder = -0.5;
      root.add(well);
      materials.push(band);
    }
    const material = new LineMaterial({
      color: wall.color,
      linewidth: wall.lineWidth,
      worldUnits: false,
      dashed: wall.dash === 'dashed',
      dashSize: dash,
      gapSize: dash * 0.7,
      transparent: wall.gate === true,
    });
    const line = new Line2(geometry, material);
    line.computeLineDistances();
    line.renderOrder = 1;
    root.add(line);
    materials.push(material);
    if (wall.gate) gates.set(w, material);
  });
  return { materials, gates };
}

/**
 * Kind markers (KIND-9): for each marker in use, an instanced mesh of its shape, placed
 * over the particles of the kinds that have it, in a colour contrasting with each disc.
 */
function createMarkers(info: SceneInfo, capacity: number, clipping: THREE.Plane[] | null) {
  const group = new THREE.Group();
  group.renderOrder = 2;
  const material = new THREE.MeshBasicMaterial();
  material.clippingPlanes = clipping;
  // Per type, the mesh drawing its marker (null for the plain disc or no marker).
  const byType: (THREE.InstancedMesh | null)[] = [];
  const meshes = new Map<string, THREE.InstancedMesh>();
  for (const name of info.typeMarkers ?? []) {
    const shapes = MARKER_SHAPES[name] ?? [];
    if (shapes.length === 0) {
      byType.push(null);
      continue;
    }
    let mesh = meshes.get(name);
    if (!mesh) {
      mesh = new THREE.InstancedMesh(markerGeometry(shapes), material, capacity);
      mesh.count = 0;
      mesh.setColorAt(0, new THREE.Color());
      mesh.renderOrder = 2;
      mesh.position.z = 0.05;
      meshes.set(name, mesh);
      group.add(mesh);
    }
    byType.push(mesh);
  }
  const counts = new Map<THREE.InstancedMesh, number>();
  const contrast = new THREE.Color();
  return {
    group,
    /** Adds the marker of a particle showing `type`, at the disc's transform. */
    place(type: number, matrix: THREE.Matrix4, color: THREE.Color) {
      const mesh = byType[type];
      if (!mesh) return;
      const k = counts.get(mesh) ?? 0;
      mesh.setMatrixAt(k, matrix);
      mesh.setColorAt(k, contrast.setHex(markerColor(color.r, color.g, color.b)));
      counts.set(mesh, k + 1);
    },
    /** Ends a frame: shows what was placed. */
    done() {
      for (const mesh of meshes.values()) {
        mesh.count = counts.get(mesh) ?? 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      counts.clear();
    },
    dispose() {
      for (const mesh of meshes.values()) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
      material.dispose();
    },
  };
}

function markerGeometry(shapes: readonly MarkerShape[]): THREE.BufferGeometry {
  const parts = shapes.map((shape) => {
    const geometry =
      shape.type === 'circle'
        ? new THREE.CircleGeometry(shape.radius, 24)
        : new THREE.ShapeGeometry(
            new THREE.Shape(shape.points.map(([x, y]) => new THREE.Vector2(x, y))),
          );
    // ShapeGeometry has no normals; markers are unlit, so keep positions only.
    const plain = new THREE.BufferGeometry();
    plain.setAttribute('position', geometry.getAttribute('position'));
    plain.setIndex(geometry.getIndex());
    return plain;
  });
  return parts.length === 1 ? parts[0]! : mergeGeometries(parts)!;
}
