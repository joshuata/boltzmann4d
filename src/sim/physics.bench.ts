// Macro benchmarks: run with `mise run bench` (not part of `pnpm test` or CI).
// Particle counts come from real presets so numbers stay comparable as the engine changes.
// TODO(plan 0002): build the simulation from each preset's initial state once the stub is
// replaced by the event-driven engine, and report events per second.
import { test } from 'vitest';
import { loadPresetText, loadSettings } from '../io';
import { Physics } from './physics';

// The largest reflecting and periodic presets, plus a synthetic scene well beyond them,
// since per-event cost grows with the particle count.
const SCENES = ['2Dmixture', '2Dbrownian', 1000] as const;

async function particleCountOf(scene: string | number): Promise<number> {
  if (typeof scene === 'number') return scene;
  const { settings } = loadSettings(await loadPresetText(scene));
  return settings.species.reduce((n, s) => n + s.positions.length / 3, 0);
}

for (const scene of SCENES) {
  const preset = typeof scene === 'number' ? 'synthetic' : scene;
  test(`advance one frame: ${preset}`, async ({ bench }) => {
    const particleCount = await particleCountOf(scene);
    let physics = new Physics({ particleCount });

    await bench(
      `${preset} (${particleCount} particles)`,
      {
        beforeAll: () => {
          physics = new Physics({ particleCount });
          physics.advanceToNextFrame(); // the first call only creates the first frame
        },
      },
      () => {
        physics.advanceToNextFrame();
      },
    ).run();
  });
}
