// Short descriptions of scenarios, for lists and the arena panel.
import { describeSpecies, type Boundary, type Scenario } from '@boltzmann4d/engine/scenario';

export const BOUNDARY_LABELS: Record<Boundary, string> = {
  PERIODIC: 'Periodic (no walls)',
  REFLECTING: 'Box with walls',
  DIVIDED: 'Divided box',
  HOLE: 'Divided box with a hole',
  PISTON: 'Box with a movable piston',
};

/** One line about a scenario for lists, e.g. "2D · Divided box · 30 Red, 30 Blue". */
export function summarizeScenario(scenario: Scenario): string {
  const counts = scenario.kinds
    .map((kind) => {
      const species = describeSpecies(scenario, kind.id);
      return species && species.count > 0 ? `${species.count} ${kind.name}` : null;
    })
    .filter(Boolean)
    .join(', ');
  return [`${scenario.arena.dimensions}D`, BOUNDARY_LABELS[scenario.arena.boundary], counts]
    .filter(Boolean)
    .join(' · ');
}
