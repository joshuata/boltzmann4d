// 3D view (CoreProfileRenderer's 3D path in boltzmann3d): a perspective camera looking at
// the box, which turns about its centre (x axis, then y), lit instanced spheres, the
// walls as coloured panels seen from inside, the divider with its hole, and the piston.
//
// Periodic arenas draw each sphere's wrapped images, clipped to the box. Trace mode
// (VIEW-5) leaves a dot at each particle's centre every frame, in box coordinates, so
// the trace turns with the box.
import * as THREE from 'three';
import type { RenderFrame, SceneInfo } from '@boltzmann4d/engine/sim';
import { periodicImages3D } from './periodic-images';
import { disposeTree, NM, ParticleColors, type View } from './view';

/** Vertical field of view, in degrees (LwjglRenderSurface). */
const FIELD_OF_VIEW = 30;
/** Wall colours (LwjglRenderSurface's defaults): gold sides, tan top and bottom. */
const GOLD = 0xffe080;
const TAN = 0xe0c0a0;
const DIVIDER_COLOR = 0xffffff;
const HOLE_EDGE_COLOR = 0x808080;
/**
 * Java's shading: 28% ambient plus 72% diffuse from a light fixed relative to the camera.
 * Three.js divides diffuse light by π, so intensities are scaled by π to match.
 */
const AMBIENT = 0.28 * Math.PI;
const DIFFUSE = 0.72 * Math.PI;
const LIGHT_DIRECTION = new THREE.Vector3(-0.35, 0.65, 1.0);

export function createView3D(info: SceneInfo): View {
  const w = info.arenaXSize * NM;
  const h = info.arenaYSize * NM;
  const d = info.arenaZSize * NM;
  const extent = Math.hypot(w, h, d);

  const root = new THREE.Group();
  // The pivot turns about the box's centre; the box sits inside it, centred on the origin.
  const pivot = new THREE.Group();
  pivot.rotation.order = 'YXZ'; // about x first, then y, as Java's rotationY · rotationX
  const box = new THREE.Group();
  box.position.set(-w / 2, -h / 2, -d / 2);
  pivot.add(box);
  root.add(pivot);

  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.01, 1);
  // Distance from the camera to the box's centre. Java's puts the front face edge to edge
  // vertically, so turning the box pushes its corners off screen; this instead fits the
  // sphere around the box (with a little room), so it stays in view however it's turned.
  const distance = ((extent / 2) * 1.05) / Math.sin((FIELD_OF_VIEW * Math.PI) / 360);
  root.add(camera);
  root.add(new THREE.AmbientLight(0xffffff, AMBIENT));
  const light = new THREE.DirectionalLight(0xffffff, DIFFUSE);
  light.position.copy(LIGHT_DIRECTION);
  camera.add(light, light.target); // fixed relative to the camera, like Java's view-space light

  box.add(buildWalls(w, h, d));
  if (info.divider) box.add(buildDivider(info.divider, w, h, d));
  const placePiston = info.piston ? addPiston3D(box, info.piston, w, h, d) : null;
  placePiston?.(h);

  // Particles: one lit sphere each, plus wrapped images in periodic arenas.
  const count = info.radii.length;
  const radii = info.radii;
  const periodic = info.periodic;
  const material = new THREE.MeshLambertMaterial();
  const clipping = periodic ? boxClipping(w, h, d) : null;
  material.clippingPlanes = clipping?.planes ?? null;
  const particles = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 24, 16), // scaled per instance by radius
    material,
    periodic ? 8 * count : count,
  );
  particles.count = 0; // nothing to draw until the first frame
  particles.frustumCulled = false; // instances move; the unit sphere's bounds don't
  const colors = Array.from(
    { length: count },
    (_, i) => new THREE.Color(info.typeColors[info.types[i] ?? 0] ?? 0xffffff),
  );
  for (let i = 0; i < count; i++) particles.setColorAt(i, colors[i]!);
  const particleColors = new ParticleColors(info);
  let wasColoured = false;
  box.add(particles);

  let aboutX = info.viewingAngles?.[0] ?? 0;
  let aboutY = info.viewingAngles?.[1] ?? 0;
  const applyRotation = () => {
    pivot.rotation.set((aboutX * Math.PI) / 180, (aboutY * Math.PI) / 180, 0);
    root.updateMatrixWorld(true);
    clipping?.update(box.matrixWorld);
  };
  applyRotation();

  const trace = createTrace3D();
  box.add(trace.points);
  if (info.trace?.enabled) trace.setEnabled(true, info.trace.pointSize);
  let lastTime = -Infinity;

  const images = new Float64Array(24);
  const matrix = new THREE.Matrix4();

  return {
    root,
    camera,
    fit(aspect, zoom) {
      camera.aspect = aspect || 1;
      camera.zoom = zoom; // narrows the field of view, so the box grows about its centre
      // Keep at least the Java field of view horizontally too, so narrow (portrait)
      // screens still show the whole box.
      const tanHalf = Math.tan((FIELD_OF_VIEW * Math.PI) / 360);
      camera.fov =
        camera.aspect >= 1 ? FIELD_OF_VIEW : (Math.atan(tanHalf / camera.aspect) * 360) / Math.PI;
      camera.position.set(0, 0, distance);
      camera.near = Math.max(0.01, distance - extent);
      camera.far = distance + extent;
      camera.updateProjectionMatrix();
    },
    display(frame: RenderFrame) {
      if (frame.dimension !== 3) return;
      if (frame.pistonY !== undefined) placePiston?.(frame.pistonY * NM);
      // The simulation went back in time: it restarted, so start the trace afresh.
      if (frame.time < lastTime) trace.clear();
      lastTime = frame.time;
      const coloured = particleColors.mode !== 'NORMAL';
      const n = Math.min(frame.types.length, count);
      const p = frame.positions;
      let drawn = 0;
      for (let i = 0; i < n; i++) {
        const x = p[3 * i]! * NM;
        const y = p[3 * i + 1]! * NM;
        const z = p[3 * i + 2]! * NM;
        const r = radii[i]! * NM;
        trace.mark(x, y, z, particleColors.of(frame, i));
        if (!periodic) {
          matrix.makeScale(r, r, r).setPosition(x, y, z);
          if (coloured) particles.setColorAt(drawn, particleColors.of(frame, i));
          particles.setMatrixAt(drawn++, matrix);
          continue;
        }
        const k = periodicImages3D(x, y, z, r, w, h, d, images);
        for (let m = 0; m < k; m++) {
          matrix.makeScale(r, r, r).setPosition(images[3 * m]!, images[3 * m + 1]!, images[3 * m + 2]!); // prettier-ignore
          particles.setColorAt(drawn, coloured ? particleColors.of(frame, i) : colors[i]!);
          particles.setMatrixAt(drawn++, matrix);
        }
      }
      particles.count = drawn;
      particles.instanceMatrix.needsUpdate = true;
      trace.marked();
      // Back to normal colours: restore them once.
      if (wasColoured && !coloured && !periodic) {
        for (let i = 0; i < count; i++) particles.setColorAt(i, colors[i]!);
      }
      if ((periodic || coloured || wasColoured) && particles.instanceColor) {
        particles.instanceColor.needsUpdate = true;
      }
      wasColoured = coloured;
    },
    setColorMode(mode) {
      particleColors.mode = mode;
    },
    setColorLimits(limits) {
      particleColors.limits = limits;
    },
    setTrace(enabled, pointSize) {
      trace.setEnabled(enabled, pointSize);
    },
    clearTrace() {
      trace.clear();
    },
    beforeRender(renderer) {
      trace.setPixelRatio(renderer.getPixelRatio());
    },
    rotate(dx, dy) {
      aboutX = (((aboutX + dx) % 360) + 360) % 360;
      aboutY = (((aboutY + dy) % 360) + 360) % 360;
      applyRotation();
    },
    dispose() {
      particles.dispose();
      trace.dispose();
      disposeTree(root);
    },
  };
}

/**
 * Dots the 3D trace keeps: about a minute of a 200-particle run at 60 frames a second.
 * Once full, the oldest dots are overwritten.
 */
const TRACE_CAPACITY = 1 << 20;

/**
 * The 3D trace (VIEW-5): round dot sprites of `pointSize` pixels, whatever their depth,
 * at each particle's centre every frame, in a ring buffer of TRACE_CAPACITY dots. Periodic
 * arenas trace each particle's position in the box (not its wrapped images).
 */
function createTrace3D() {
  // Allocated when tracing starts, so scenes that never trace don't pay for it.
  let positions = new Float32Array(0);
  let colors = new Float32Array(0);
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.PointsMaterial({
    size: 2,
    sizeAttenuation: false,
    vertexColors: true,
    map: dotTexture(),
    alphaTest: 0.5,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false; // the bounds change every frame
  points.visible = false;

  let enabled = false;
  let pointSize = 2;
  /** Next slot to write, and how many slots hold dots. */
  let next = 0;
  let filled = 0;
  /** First slot written this frame, and how many. */
  let frameStart = 0;
  let frameCount = 0;

  const allocate = () => {
    if (positions.length > 0) return;
    positions = new Float32Array(TRACE_CAPACITY * 3);
    colors = new Float32Array(TRACE_CAPACITY * 3);
    const position = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
    const color = new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', position);
    geometry.setAttribute('color', color);
  };

  return {
    points,
    setEnabled(on: boolean, size: number) {
      if (on) allocate();
      if (!on) this.clear(); // off clears, as in 2D
      enabled = on;
      pointSize = size > 0 ? size : 2;
      points.visible = on;
    },
    setPixelRatio(ratio: number) {
      material.size = pointSize * ratio;
    },
    clear() {
      next = 0;
      filled = 0;
      geometry.setDrawRange(0, 0);
    },
    mark(x: number, y: number, z: number, color: THREE.Color) {
      if (!enabled) return;
      if (frameCount === 0) frameStart = next;
      const k = 3 * next;
      positions[k] = x;
      positions[k + 1] = y;
      positions[k + 2] = z;
      colors[k] = color.r;
      colors[k + 1] = color.g;
      colors[k + 2] = color.b;
      next = (next + 1) % TRACE_CAPACITY;
      filled = Math.min(filled + 1, TRACE_CAPACITY);
      frameCount++;
    },
    /** Uploads this frame's dots (the slots written, which may wrap around the end). */
    marked() {
      if (!enabled || frameCount === 0) return;
      const position = geometry.getAttribute('position') as THREE.BufferAttribute;
      const color = geometry.getAttribute('color') as THREE.BufferAttribute;
      for (const attribute of [position, color]) {
        const first = Math.min(frameCount, TRACE_CAPACITY - frameStart);
        attribute.addUpdateRange(3 * frameStart, 3 * first);
        if (first < frameCount) attribute.addUpdateRange(0, 3 * (frameCount - first));
        attribute.needsUpdate = true;
      }
      geometry.setDrawRange(0, filled);
      frameCount = 0;
    },
    dispose() {
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
    },
  };
}

/** A white disc on transparent, for round dot sprites (no canvas, so it works in workers). */
function dotTexture(): THREE.DataTexture {
  const size = 16;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - size / 2;
      const dy = y + 0.5 - size / 2;
      const k = 4 * (y * size + x);
      data[k] = data[k + 1] = data[k + 2] = 255;
      data[k + 3] = dx * dx + dy * dy <= (size / 2) ** 2 ? 255 : 0;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The piston as Java draws it (CoreProfileRenderer.addPiston3D): a plate two valve radii
 * thick under its face, the box's full width and depth, and a round shaft up from its
 * middle to the top, in the side walls' gold. Returns a function that moves it to height
 * `y` (nm); at the top it's hidden.
 */
function addPiston3D(
  box: THREE.Group,
  piston: NonNullable<SceneInfo['piston']>,
  w: number,
  h: number,
  d: number,
): (y: number) => void {
  const material = new THREE.MeshLambertMaterial({ color: GOLD });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  plate.scale.set(w, 1, d);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), material);
  const shaftRadius = piston.shaftRadius * NM;
  shaft.scale.set(shaftRadius, 1, shaftRadius);
  box.add(plate, shaft);
  return (y) => {
    const valveTop = Math.min(y + 2 * piston.valveRadius * NM, h);
    plate.visible = valveTop > y;
    plate.scale.y = Math.max(valveTop - y, 1e-6);
    plate.position.set(w / 2, (y + valveTop) / 2, d / 2);
    shaft.visible = h > valveTop;
    shaft.scale.y = Math.max(h - valveTop, 1e-6);
    shaft.position.set(w / 2, (valveTop + h) / 2, d / 2);
  };
}

/**
 * The six walls as panels facing into the box. Front-face culling of the outside means
 * only the walls behind the particles show, whichever way the box is turned.
 */
function buildWalls(w: number, h: number, d: number): THREE.Group {
  const walls = new THREE.Group();
  const wall = (
    width: number,
    height: number,
    color: number,
    position: [number, number, number],
    rotation: [number, number, number],
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshLambertMaterial({ color }),
    );
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    walls.add(mesh);
  };
  const half = Math.PI / 2;
  // A plane faces +z; each is turned to face the inside of the box.
  wall(w, h, GOLD, [w / 2, h / 2, 0], [0, 0, 0]); // back (z = 0)
  wall(w, h, GOLD, [w / 2, h / 2, d], [0, Math.PI, 0]); // front (z = d)
  wall(d, h, GOLD, [0, h / 2, d / 2], [0, half, 0]); // left (x = 0)
  wall(d, h, GOLD, [w, h / 2, d / 2], [0, -half, 0]); // right (x = w)
  wall(w, d, TAN, [w / 2, 0, d / 2], [-half, 0, 0]); // bottom (y = 0)
  wall(w, d, TAN, [w / 2, h, d / 2], [half, 0, 0]); // top (y = h)
  return walls;
}

/**
 * The divider: a slab across the box at its centre, with a round hole lined by a grey
 * tunnel and the ring of edge spheres the physics bounces particles off.
 */
function buildDivider(
  info: NonNullable<SceneInfo['divider']>,
  w: number,
  h: number,
  d: number,
): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ color: DIVIDER_COLOR });
  const x0 = info.leftX * NM;
  const thickness = (info.rightX - info.leftX) * NM;
  const holeRadius = ((info.holeDiameter ?? 0) / 2) * NM;

  if (holeRadius <= 0 || !info.edgeY || !info.edgeZ) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(thickness, h, d), material);
    slab.position.set(x0 + thickness / 2, h / 2, d / 2);
    group.add(slab);
    return group;
  }

  // The slab's face in the (z, y) plane with the hole cut out, extruded along x.
  const face = new THREE.Shape();
  face.moveTo(0, 0).lineTo(d, 0).lineTo(d, h).lineTo(0, h).closePath();
  face.holes.push(new THREE.Path().absarc(d / 2, h / 2, holeRadius, 0, 2 * Math.PI, true));
  const slab = new THREE.Mesh(
    new THREE.ExtrudeGeometry(face, { depth: thickness, bevelEnabled: false, curveSegments: 48 }),
    material,
  );
  // Shape x → box z, shape y → box y, extrusion (+z) → box +x.
  slab.rotation.y = -Math.PI / 2;
  slab.position.set(x0 + thickness, 0, 0);
  group.add(slab);

  const tunnel = new THREE.Mesh(
    new THREE.CylinderGeometry(holeRadius, holeRadius, thickness, 48, 1, true),
    new THREE.MeshLambertMaterial({ color: HOLE_EDGE_COLOR, side: THREE.BackSide }),
  );
  tunnel.rotation.z = Math.PI / 2;
  tunnel.position.set(x0 + thickness / 2, h / 2, d / 2);
  group.add(tunnel);

  const r = info.edgeRadius * NM;
  const edges = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshLambertMaterial({ color: HOLE_EDGE_COLOR }),
    info.edgeY.length,
  );
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < info.edgeY.length; i++) {
    matrix.makeScale(r, r, r).setPosition(x0 + thickness / 2, info.edgeY[i]! * NM, info.edgeZ[i]! * NM); // prettier-ignore
    edges.setMatrixAt(i, matrix);
  }
  group.add(edges);
  return group;
}

/**
 * Planes keeping only what lies inside the box. Clipping planes are in world space, so
 * `update` moves them with the box whenever the view turns.
 */
function boxClipping(w: number, h: number, d: number) {
  const local = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), w),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), h),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), d),
  ];
  const planes = local.map((plane) => plane.clone());
  return {
    planes,
    update(boxToWorld: THREE.Matrix4) {
      planes.forEach((plane, k) => plane.copy(local[k]!).applyMatrix4(boxToWorld));
    },
  };
}
