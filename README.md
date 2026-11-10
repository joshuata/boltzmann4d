# Boltzmann 4D

A web port of [Boltzmann 3D](https://github.com/byu-chem/boltzmann3d) (vendored as a git submodule in `vendor/boltzmann3d`), a kinetic theory demonstrator. It runs an event-driven hard-sphere gas simulation in 1D, 2D and 3D.

```sh
pnpm install
pnpm dev
```

The home page lists the bundled presets; each runs at its own URL (`/simulate/2Deffuse`), and picking another in the sidebar moves to its page. `?render=main` draws on the main thread instead of the render worker.

The repo is a pnpm workspace: `packages/engine` (physics, statistics, settings files), `packages/simulator` (the viewer), `packages/simulation-editor` and the SvelteKit site in `apps/web`.

See [AGENTS.md](AGENTS.md) for the architecture and contributor notes. Licensed under GPL-3.0.
