# Boltzmann 4D

A web port of [Boltzmann 3D](https://github.com/byu-chem/boltzmann3d) (vendored as a git submodule in `vendor/boltzmann3d`), a kinetic theory demonstrator. It runs an event-driven hard-sphere gas simulation in 1D, 2D and 3D.

```sh
pnpm install
pnpm dev
```

Pick a preset from the sidebar; the choice is kept in the URL (`?preset=2Deffuse`), so links and reloads open the same preset. `?render=main` draws on the main thread instead of the render worker.

See [AGENTS.md](AGENTS.md) for the architecture and contributor notes. Licensed under GPL-3.0.
