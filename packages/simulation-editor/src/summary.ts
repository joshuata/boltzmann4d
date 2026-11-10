// One-line descriptions of scenarios, for lists such as the user's kept scenarios.
import type { Scenario } from '@boltzmann4d/engine/scenario';

type Boundary = Scenario['arena']['boundary'];

export const BOUNDARY_LABELS: Record<Boundary, string> = {
  PERIODIC: 'Periodic (no walls)',
  REFLECTING: 'Box with walls',
  DIVIDED: 'Divided box',
  HOLE: 'Divided box with a hole',
  PISTON: 'Box with a movable piston',
};

/** How many particles of each kind the scenario starts with, by kind id. */
function countsByKind(scenario: Scenario): Map<string, number> {
  const counts = new Map<string, number>();
  for (const population of scenario.populations) {
    const n =
      population.randomlyPlaced.reduce((sum, block) => sum + block.count, 0) +
      population.particles.length;
    counts.set(population.kind, (counts.get(population.kind) ?? 0) + n);
  }
  return counts;
}

/** One line about a scenario for lists, e.g. "2D · Divided box · 30 Red, 30 Blue". */
export function summarizeScenario(scenario: Scenario): string {
  const counts = countsByKind(scenario);
  const particles = scenario.kinds
    .filter((kind) => (counts.get(kind.id) ?? 0) > 0)
    .map((kind) => `${counts.get(kind.id)} ${kind.name}`)
    .join(', ');
  return [`${scenario.arena.dimensions}D`, BOUNDARY_LABELS[scenario.arena.boundary], particles]
    .filter(Boolean)
    .join(' · ');
}
