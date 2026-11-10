# AGENTS.md

Project context for any coding agent working in this repo. This is the single source of truth; agent-specific files (e.g. `CLAUDE.md`) only point here.

## What this is

boltzmann4d is a TypeScript web port of [boltzmann3d](https://github.com/byu-chem/boltzmann3d), checked out as a git submodule at `vendor/boltzmann3d` (our fork, [joshuata/boltzmann3d](https://github.com/joshuata/boltzmann3d), branch `boltzmann4d-parity-tools`, which adds the parity and benchmark tools). Run `git submodule update --init` after cloning. That project is a Java 25/Swing/LWJGL kinetic-theory teaching app (BYU Chemistry, 2013, GPL-3.0) for exploring the Maxwell–Boltzmann distribution, pressure, effusion and related ideas.

The heart of it is a **custom event-driven hard-sphere simulation**. There is no fixed timestep:

- `Calendar.java` keeps a pairwise event table plus a heap.
- `Physics.java` repeatedly pops the next event, applies it, and re-predicts the affected events.

It supports 1D, 2D and 3D arenas, pistons, thermostats, dividers and holes (effusion, Maxwell demon), energy wells, red↔blue reactions, and time reversal. Scenes typically have 25–200 particles.

**Goal: the same physics, not the same code.** The simulation equations and results must not change, but the code does not need to mirror the Java version. Refactor where and when it makes sense.

## Stack and why

| Concern | Choice | Why |
| --- | --- | --- |
| Physics | Custom TS port, no engine | General engines (Matter.js, Rapier, Planck) step in fixed time increments with soft contacts. They would change the results and can't do wells, reactions or time reversal. |
| Rendering | Three.js | One engine for 1D/2D (orthographic camera) and 3D (perspective camera, lit instanced spheres). |
| UI | Svelte 5 + Vite + TypeScript | The UI is mostly forms, dialogs and live readouts. |
| Charts | Custom Canvas2D | Ports `StatPanel`, `HistogramBins` and `History`. |
| Threading | Physics worker + render worker | Physics mirrors `ThreadController`. Three.js draws on an `OffscreenCanvas` in its own worker; frames go physics → renderer directly over a `MessageChannel` as transferable typed arrays, so the main thread only runs the UI. `?render=main` (and browsers without `OffscreenCanvas`) draw on the main thread instead. |
| Tooling | mise, pnpm, hk, Vitest, ESLint, Prettier, markdownlint-cli2 | mise pins tool versions; hk runs every linter and the pre-commit hook. |

TypeScript is pinned to 6.0.x because typescript-eslint and svelte-check don't support TS 7 yet.

## Layout

```text
src/
  sim/      pure TS physics (no DOM / Three.js imports) — port of model/physics
  stats/    statistics + Formulas — port of model/statistics
  io/       .set file parsing (Ohm grammar) and loading, plus the bundled presets — from model/io
  utils/    shared pure helpers (unit conversions) — from utils
  worker/   physics Web Worker + message protocol
  render/   Three.js scene (1D/2D/3D views, color modes, periodic ghosts, trace) + render worker
  ui/       Svelte components (App.svelte = root)
  charts/   Canvas2D histogram / history plots
```

Java sources referenced above live in `vendor/boltzmann3d/src/edu/byu/chem/boltzmann/`. Presets (`*.set`) are in `resources/simsettingsfiles/presets/`. The rendering behaviours to preserve are listed in `vendor/boltzmann3d/docs/rendering-baseline.md`.

## Commands

Tool versions (node, pnpm, hk, pkl, markdownlint-cli2) are pinned in `mise.toml`. Run `mise install` once; it also installs `node_modules`. After that, `mise run <task>` reinstalls `node_modules` automatically whenever `package.json` or `pnpm-lock.yaml` changes (mise's `[deps.pnpm]` provider). Calling `pnpm` directly doesn't, so run `mise deps` after pulling if you skip `mise run`. Run `hk install` once to enable the git pre-commit hook.

- `pnpm dev`: start the dev server
- `pnpm build`: type-check (svelte-check), then build the production bundle
- `pnpm test`: run Vitest; tests sit next to the code as `*.test.ts`
- `mise run bench`: run the benchmarks (`*.bench.ts`, using Vitest's `bench` test fixture); not part of `pnpm test` or CI
- `mise run test:parity`: check the engine against the Java app's parity fixtures, regenerating them first (`java:parity`) only if the Java program changed
- `mise run bench:report`: rebuild the benchmark tables in `benchmarks/README.md`, first rerunning `java:bench` (Java app) or `web:bench` (web engine) only if that program changed
- Tasks that run a program declare its inputs and outputs (`sources`/`outputs` in `mise.toml`, compared by content), so the slow Java runs are skipped unless `vendor/boltzmann3d` changes
- `mise run profile [preset] [--events N] [--particles N [--periodic]]`: run the engine headless under the V8 profiler (`scripts/profile.ts`) and write a `.cpuprofile` to `profiles/`
- `pnpm lint` / `mise run lint`: run every hk check on all files: ESLint (TS + Svelte rules), svelte-check (types), Prettier, markdownlint-cli2
- `pnpm format` / `mise run fix`: apply every hk fixer on all files

Linters are configured in `hk.pkl`, plus `eslint.config.js`, `.prettierrc` and `.markdownlint-cli2.jsonc`. The pre-commit hook runs the same steps on staged files and auto-fixes them.

Run `pnpm build && pnpm test && pnpm lint` before calling work done.

## CI and deployment

`.github/workflows/ci.yml` runs `mise run lint`, `mise run test` and `mise run build` on every pull request and on pushes to `main`. On `main` it then deploys `dist/` to GitHub Pages at `https://joshuata.github.io/boltzmann4d/`.

Production builds use the base path `/boltzmann4d/` (see `vite.config.ts`); the dev server stays at `/`. Load assets through Vite (imports, `?worker`, `?raw`, `import.meta.glob`) or `import.meta.env.BASE_URL` so URLs keep working under that path. To check a production build locally, run `pnpm build && pnpm preview` and open `http://localhost:4173/boltzmann4d/`.

## Porting rules

- The Java code is a reference, not a template. Restructure, rename, merge or split classes, and drop dead code, Swing leftovers and quirks whenever that makes the TypeScript clearer. Keeping a Java name is fine when it helps someone find the original, but it isn't required.
- When a refactor touches physics, prove the results are unchanged with parity tests (below).
- Keep the physics benchmarkable and profilable: synchronous, deterministic and headless (no timers, randomness, DOM or logging inside `src/sim`), with `*.bench.ts` benchmarks for hot paths. See plan 0002.
- Name `.ts` files in kebab-case (`thread-controller.ts`) and Svelte components in PascalCase (`PlayPauseButton.svelte`). ESLint enforces this.
- `src/sim`, `src/stats`, `src/io` and `src/utils` must stay pure: no DOM, no Three.js. They run in a Worker and in Node tests.
- Physics changes must keep `src/sim/parity.test.ts` green: the engine reproduces the Java app's events and final states bit for bit from the same initial state (fixtures in `src/sim/parity/`).

## Plans

- Active plans go in `.agents/plans/` as `NNNN-short-slug.md`.
- When a plan is complete, move it to `.agents/archived-plans/`.
- Read the active plans before starting larger work.
