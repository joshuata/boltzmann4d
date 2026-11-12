// The simulation viewer. Apps mount <Simulator> inside a sized container and load the
// shared theme (@boltzmann4d/ui/theme.css) once.
export { default as Simulator } from './Simulator.svelte';
export { default as SnapshotSpeedHistogram } from './charts/SnapshotSpeedHistogram.svelte';
export { SimulationClient } from './ui/simulation.svelte';
export type { SnapshotListener } from './ui/snapshot-hub';
export {
  FreePathAccumulator,
  kineticEnergiesOf,
  mergeBatches,
  replay,
  speedsOf,
  type EventBatch,
  type StateSnapshot,
} from '@boltzmann4d/engine/sim';
