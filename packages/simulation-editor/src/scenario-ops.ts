// What the editor does to a scenario, as pure functions: each takes a scenario and returns a
// new one, so every edit is one step of the undo history (EDIT-15). Shapes are addressed by
// selection keys, `wall:<id>` and `region:<id>`.
import {
  DEFAULT_PALETTE,
  LARGE_PALETTE,
  MARKERS,
  PALETTES,
  parseScenario,
  SCENARIO_FORMAT,
  type Kind,
  type Population,
  type Scenario,
  type Wall,
  type WallKind,
} from '@boltzmann4d/engine/scenario';
import { averageVelocity } from '@boltzmann4d/engine/stats/formulas';
import { convert } from '@boltzmann4d/engine/utils/units';
import { round, type Point } from './geometry';

export type SelectionKey = `wall:${string}` | `region:${string}`;

export const wallKey = (id: string): SelectionKey => `wall:${id}`;
export const regionKey = (id: string): SelectionKey => `region:${id}`;

export function parseKey(key: SelectionKey): { type: 'wall' | 'region'; id: string } {
  const at = key.indexOf(':');
  return { type: key.slice(0, at) as 'wall' | 'region', id: key.slice(at + 1) };
}

/** Most kinds a scenario may have (KIND-1). */
export const MAX_KINDS = MARKERS.length;

/** A new 2D scenario: a 70 × 50 nm box with 50 particles of one kind at 300 K (EDIT-17). */
export function blankScenario(): Scenario {
  const kind: Kind = { id: 'a', name: 'A', mass: 40, radius: 1 };
  return parseScenario({
    format: SCENARIO_FORMAT,
    version: 2,
    arena: {
      dimensions: 2,
      size: [70, 50, 50],
      boundary: 'REFLECTING',
      holeSize: 8,
      dividerThermalMode: 'INSULATING',
      pistonSpeed: 0.5,
    },
    modes: { maxwellDemon: false },
    kinds: [kind],
    populations: [fill(kind, 50, 300, 2)],
    run: { paused: false, speed: '1x' },
    statistics: {
      name: 'INSTANTANEOUS_SPEED',
      kinds: 'all',
      cumulative: false,
      width: false,
      history: false,
      pressureAveragingTime: 60,
      forgetTime: 4,
      pressurePredictionMode: 'IDEAL',
    },
    display: {
      colorScheme: 'DARK',
      palette: DEFAULT_PALETTE,
      markers: true,
      lighting: true,
      viewingAngles: [0, 0],
      coloringMode: 'NORMAL',
      traceMode: false,
      tracePointSize: 2,
    },
  });
}

/**
 * A fill row (EDIT-3): `count` particles of `kind` at `temperature` K, in a region or the whole
 * arena. Their starting speed is the mean speed at that temperature; the scenario rescales
 * velocities to the temperature anyway.
 */
export function fill(
  kind: Kind,
  count: number,
  temperature: number,
  dimensions: number,
  region?: string,
): Population {
  return {
    kind: kind.id,
    ...(region !== undefined && { region }),
    temperature,
    randomlyPlaced: [{ count, averageVelocity: meanSpeed(kind, temperature, dimensions) }],
    particles: [],
  };
}

function meanSpeed(kind: Kind, temperature: number, dimensions: number): number {
  const speed = averageVelocity(temperature, convert('amu', 'kg', kind.mass), dimensions);
  return Number.isFinite(speed) ? round(speed, 1) : 0;
}

/** An id with `prefix` that nothing in `taken` has yet. */
export function nextId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

const clone = (scenario: Scenario): Scenario => structuredClone(scenario);

export function addWall(
  scenario: Scenario,
  points: Point[],
  closed: boolean,
): { scenario: Scenario; key: SelectionKey } {
  const next = clone(scenario);
  const id = nextId(
    'wall',
    next.walls.map((w) => w.id),
  );
  next.walls.push({ id, points, closed, kind: { type: 'reflecting' }, style: {} });
  return { scenario: next, key: wallKey(id) };
}

/**
 * A spawn region (EDIT-3): a rectangle or polygon, filled with 20 particles of the first kind
 * so it does something straight away.
 */
export function addRegion(
  scenario: Scenario,
  shape: Scenario['spawnRegions'][number]['shape'],
): { scenario: Scenario; key: SelectionKey } {
  const next = clone(scenario);
  const id = nextId(
    'region',
    next.spawnRegions.map((r) => r.id),
  );
  next.spawnRegions.push({ id, name: `Region ${next.spawnRegions.length + 1}`, shape });
  const kind = next.kinds[0];
  if (kind) next.populations.push(fill(kind, 20, 300, next.arena.dimensions, id));
  return { scenario: next, key: regionKey(id) };
}

/** Every point of a shape (a rectangle's two corners). */
export function shapePoints(scenario: Scenario, key: SelectionKey): Point[] {
  const { type, id } = parseKey(key);
  if (type === 'wall') return scenario.walls.find((w) => w.id === id)?.points ?? [];
  const shape = scenario.spawnRegions.find((r) => r.id === id)?.shape;
  if (!shape) return [];
  return shape.type === 'rectangle' ? [shape.min, shape.max] : shape.points;
}

/** Moves the shapes by (dx, dy) nm. */
export function moveShapes(
  scenario: Scenario,
  keys: Iterable<SelectionKey>,
  dx: number,
  dy: number,
): Scenario {
  const next = clone(scenario);
  const shift = ([x, y]: Point): Point => [round(x + dx), round(y + dy)];
  for (const key of keys) {
    const { type, id } = parseKey(key);
    if (type === 'wall') {
      const wall = next.walls.find((w) => w.id === id);
      if (wall) wall.points = wall.points.map(shift);
    } else {
      const shape = next.spawnRegions.find((r) => r.id === id)?.shape;
      if (shape?.type === 'rectangle') {
        shape.min = shift(shape.min);
        shape.max = shift(shape.max);
      } else if (shape) {
        shape.points = shape.points.map(shift);
      }
    }
  }
  return next;
}

/** Moves one point of a shape (a rectangle's corner 0 is min, 1 is max) to `to`. */
export function movePoint(
  scenario: Scenario,
  key: SelectionKey,
  index: number,
  to: Point,
): Scenario {
  const next = clone(scenario);
  const { type, id } = parseKey(key);
  if (type === 'wall') {
    const wall = next.walls.find((w) => w.id === id);
    if (wall && index < wall.points.length) wall.points[index] = to;
  } else {
    const shape = next.spawnRegions.find((r) => r.id === id)?.shape;
    if (shape?.type === 'rectangle') {
      // Keep min below and left of max whichever corner is dragged past the other.
      const other = index === 0 ? shape.max : shape.min;
      shape.min = [Math.min(to[0], other[0]), Math.min(to[1], other[1])];
      shape.max = [Math.max(to[0], other[0]), Math.max(to[1], other[1])];
    } else if (shape && index < shape.points.length) {
      shape.points[index] = to;
    }
  }
  return next;
}

/** Removes the shapes, and the fill rows of removed regions. */
export function deleteShapes(scenario: Scenario, keys: Iterable<SelectionKey>): Scenario {
  const walls = new Set<string>();
  const regions = new Set<string>();
  for (const key of keys) {
    const { type, id } = parseKey(key);
    (type === 'wall' ? walls : regions).add(id);
  }
  const next = clone(scenario);
  next.walls = next.walls.filter((w) => !walls.has(w.id));
  next.spawnRegions = next.spawnRegions.filter((r) => !regions.has(r.id));
  next.populations = next.populations.filter((p) => p.region === undefined || !regions.has(p.region)); // prettier-ignore
  return next;
}

/** Changes the walls' kind, keeping each one's settings when the kind stays the same. */
export function setWallKind(scenario: Scenario, ids: string[], kind: WallKind): Scenario {
  const next = clone(scenario);
  for (const wall of next.walls) {
    if (ids.includes(wall.id) && wall.kind.type !== kind.type) wall.kind = structuredClone(kind);
  }
  return next;
}

/** Applies `change` to each of the walls. */
export function editWalls(
  scenario: Scenario,
  ids: string[],
  change: (wall: Wall) => void,
): Scenario {
  const next = clone(scenario);
  for (const wall of next.walls) if (ids.includes(wall.id)) change(wall);
  return next;
}

/** Default settings for a newly chosen wall kind (WALL-4). */
export function defaultWallKind(type: WallKind['type'], scenario: Scenario): WallKind {
  switch (type) {
    case 'reflecting':
      return { type };
    case 'thermal':
      return { type, temperature: 300 };
    case 'semipermeable':
      return { type, passes: scenario.kinds.slice(0, 1).map((k) => k.id) };
    case 'gate':
      return { type, open: false };
    case 'attractive':
      return { type, depth: 2, width: 1 };
  }
}

/** The fill rows of a region, or of the whole arena when `region` is undefined. */
export function fillsOf(scenario: Scenario, region: string | undefined): Population[] {
  return scenario.populations.filter((p) => p.region === region);
}

/**
 * Replaces the fill rows of a region (or the whole arena), keeping the populations of every
 * other region in their order.
 */
export function setFills(
  scenario: Scenario,
  region: string | undefined,
  fills: Population[],
): Scenario {
  const next = clone(scenario);
  next.populations = [...next.populations.filter((p) => p.region !== region), ...fills];
  return next;
}

/** A row's count, temperature and kind; rows with explicitly placed particles keep them. */
export interface FillRow {
  kind: string;
  count: number;
  /** K; null when the population has none (its speed is used). */
  temperature: number | null;
}

export function rowOf(population: Population): FillRow {
  return {
    kind: population.kind,
    count: population.randomlyPlaced.reduce((n, b) => n + b.count, 0),
    temperature: population.temperature ?? null,
  };
}

/** A population from a row, keeping `previous`'s placed particles and speed where it can. */
export function populationOf(
  scenario: Scenario,
  row: FillRow,
  region: string | undefined,
  previous?: Population,
): Population {
  const kind = scenario.kinds.find((k) => k.id === row.kind) ?? scenario.kinds[0]!;
  const temperature = row.temperature ?? 300;
  const fresh = fill(kind, row.count, temperature, scenario.arena.dimensions, region);
  if (!previous) return fresh;
  return {
    ...fresh,
    ...(row.temperature === null && { temperature: undefined }),
    randomlyPlaced:
      row.temperature === null && previous.randomlyPlaced[0]
        ? [{ count: row.count, averageVelocity: previous.randomlyPlaced[0].averageVelocity }]
        : fresh.randomlyPlaced,
    particles: previous.kind === kind.id ? previous.particles : [],
  };
}

/** What uses a kind (KIND-3): fill rows, walls and reactions, described for the user. */
export function kindUsage(scenario: Scenario, kindId: string): string[] {
  const uses: string[] = [];
  const regions = new Map(scenario.spawnRegions.map((r) => [r.id, r.name ?? r.id]));
  for (const p of scenario.populations) {
    if (p.kind !== kindId) continue;
    uses.push(p.region ? `the fill of ${regions.get(p.region) ?? p.region}` : 'the arena fill');
  }
  for (const wall of scenario.walls) {
    if (wall.kind.type === 'semipermeable' && wall.kind.passes.includes(kindId)) {
      uses.push(`semipermeable wall ${wall.id}`);
    }
  }
  scenario.reactions.forEach((r, i) => {
    if ([...r.reactants, ...r.products].includes(kindId)) uses.push(`reaction ${i + 1}`);
  });
  if (scenario.statistics.kinds !== 'all' && scenario.statistics.kinds.includes(kindId)) {
    uses.push('the statistics');
  }
  return [...new Set(uses)];
}

/**
 * Adds a kind, named with the next free letter. Switches the Okabe–Ito palette to Muted
 * when it runs out of colours (KIND-7).
 */
export function addKind(scenario: Scenario): Scenario {
  const next = clone(scenario);
  if (next.kinds.length >= MAX_KINDS) return next;
  const names = new Set(next.kinds.map((k) => k.name.toLowerCase()));
  let name = 'A';
  for (let c = 65; c < 91; c++) {
    name = String.fromCharCode(c);
    if (!names.has(name.toLowerCase())) break;
  }
  const id = nextId(
    'kind',
    next.kinds.map((k) => k.id),
  );
  next.kinds.push({ id, name, mass: 40, radius: 1 });
  const palette = PALETTES[next.display.palette];
  if (next.kinds.length > palette.colors.length && next.display.palette === DEFAULT_PALETTE) {
    next.display.palette = LARGE_PALETTE;
  }
  return next;
}

/** Removes a kind, unless something uses it (KIND-3). */
export function removeKind(
  scenario: Scenario,
  kindId: string,
): { scenario: Scenario } | { refused: string[] } {
  const uses = kindUsage(scenario, kindId);
  if (uses.length > 0) return { refused: uses };
  if (scenario.kinds.length <= 1) return { refused: ['a scenario needs at least one kind'] };
  const next = clone(scenario);
  next.kinds = next.kinds.filter((k) => k.id !== kindId);
  for (const limits of Object.values(next.statistics.abscissaLimits)) delete limits.kinds[kindId];
  return { scenario: next };
}

/**
 * The shape a validation problem is about (EDIT-16), from its path (`walls[2].points[0]: …`)
 * or the region it names (`… in spawn region Left …`).
 */
export function problemTarget(scenario: Scenario, problem: string): SelectionKey | null {
  const path = /^(walls|spawnRegions|populations)\[(\d+)\]/.exec(problem);
  if (path) {
    const index = Number(path[2]);
    if (path[1] === 'walls') {
      const wall = scenario.walls[index];
      return wall ? wallKey(wall.id) : null;
    }
    if (path[1] === 'spawnRegions') {
      const region = scenario.spawnRegions[index];
      return region ? regionKey(region.id) : null;
    }
    const region = scenario.populations[index]?.region;
    return region ? regionKey(region) : null;
  }
  for (const region of scenario.spawnRegions) {
    if (region.name && problem.includes(`spawn region ${region.name} `))
      return regionKey(region.id);
  }
  return null;
}

/** A shape's name for screen readers and lists (EDIT-22). */
export function describeShape(scenario: Scenario, key: SelectionKey): string {
  const { type, id } = parseKey(key);
  if (type === 'region') {
    const region = scenario.spawnRegions.find((r) => r.id === id);
    if (!region) return 'Region';
    const count = fillsOf(scenario, id).reduce((n, p) => n + rowOf(p).count, 0);
    return `Spawn region ${region.name ?? id}, ${region.shape.type}, ${count} particles`;
  }
  const wall = scenario.walls.find((w) => w.id === id);
  if (!wall) return 'Wall';
  const kind = wall.kind;
  const detail =
    kind.type === 'thermal'
      ? `, ${kind.temperature} K`
      : kind.type === 'gate'
        ? kind.open
          ? ', open'
          : ', closed'
        : '';
  const name = `${kind.type[0]!.toUpperCase()}${kind.type.slice(1)} wall`;
  const shape = wall.closed ? 'closed' : wall.points.length === 2 ? 'segment' : 'open';
  return `${name}${detail}, ${shape}, ${wall.points.length} points`;
}
