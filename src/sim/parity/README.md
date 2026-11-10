# Parity fixtures

Each `*.json` here was written by the Java app's physics, through `ParityDump` on the `boltzmann4d-parity-tools` branch of boltzmann3d ([joshuata/boltzmann3d](https://github.com/joshuata/boltzmann3d/tree/boltzmann4d-parity-tools), a fork of byu-chem/boltzmann3d). `src/sim/parity.test.ts` replays them through the TypeScript engine and requires bit-identical results.

A fixture holds:

- the exact initial state Java loaded for the preset (Java places particles randomly, so the state is recorded rather than re-generated),
- every event Java performed, as `[type, time, part1, part2, side]`, over whole frames until at least 2,000 events,
- the final positions and velocities after those frames.

Presets whose arena type isn't ported yet (dividers and holes) are skipped by the test, not deleted, so they start checking as soon as the port lands.

To regenerate, with boltzmann3d's `boltzmann4d-parity-tools` branch at `../boltzmann3d` (or `BOLTZMANN3D_DIR` pointing at it):

```bash
mise run parity:fixtures
```
