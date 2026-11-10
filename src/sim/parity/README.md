# Parity fixtures

Each `*.json` here was written by the Java app's physics, through `ParityDump` in the boltzmann3d fork vendored at `vendor/boltzmann3d` ([joshuata/boltzmann3d](https://github.com/joshuata/boltzmann3d/tree/boltzmann4d-parity-tools), branch `boltzmann4d-parity-tools`). Java's random particle placement is seeded, so the same Java program always writes the same fixtures. `src/sim/parity.test.ts` replays them through the TypeScript engine and requires bit-identical results.

A fixture holds:

- the exact initial state Java loaded for the preset (Java places particles randomly, so the state is recorded rather than re-generated),
- every event Java performed, as `[type, time, part1, part2, side]`, over whole frames until at least 2,000 events,
- the final positions and velocities after those frames (`z` and `vz` too for 3D presets),
- for 3D arenas with a hole, the ring of edge spheres Java built (`edgeY`, `edgeZ`): they come from `Math.sin`/`Math.cos`, whose last bit differs between the JVM and JavaScript, so the test uses Java's ring rather than recomputing it.

Presets whose arena type isn't ported yet (the conducting divider) are skipped by the test, not deleted, so they start checking as soon as the port lands.

Run the parity test with:

```bash
mise run test:parity
```

It regenerates the fixtures first (`mise run java:parity`) only if the Java program in `vendor/boltzmann3d` changed.
