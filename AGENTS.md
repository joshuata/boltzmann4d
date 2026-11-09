# AGENTS.md

Project context for any coding agent working in this repo. This is the single source of truth; agent-specific files (e.g. `CLAUDE.md`) only point here.

## What this is

boltzmann4d is a TypeScript web port of [`../boltzmann3d`](../boltzmann3d). That project is a Java 25/Swing/LWJGL kinetic-theory teaching app (BYU Chemistry, 2013, GPL-3.0) for exploring the Maxwell–Boltzmann distribution, pressure, effusion and related ideas.

The heart of it is a **custom event-driven hard-sphere simulation**. There is no fixed timestep:

- `Calendar.java` keeps a pairwise event table plus a heap.
- `Physics.java` repeatedly pops the next event, applies it, and re-predicts the affected events.

It supports 1D, 2D and 3D arenas, pistons, thermostats, dividers and holes (effusion, Maxwell demon), energy wells, red↔blue reactions, and time reversal. Scenes typically have 25–200 particles.

**Goal: a faithful port. The simulation equations must not change.**

## Stack and why

| Concern | Choice | Why |
| --- | --- | --- |
| Physics | Custom TS port, no engine | General engines (Matter.js, Rapier, Planck) step in fixed time increments with soft contacts. They would change the results and can't do wells, reactions or time reversal. |
| Rendering | Three.js | One engine for 1D/2D (orthographic camera) and 3D (perspective camera, lit instanced spheres). |
| UI | Svelte 5 + Vite + TypeScript | The UI is mostly forms, dialogs and live readouts. |
| Charts | Custom Canvas2D | Ports `StatPanel`, `HistogramBins` and `History`. |
| Threading | Web Worker for physics | Mirrors `ThreadController`. Frames go to the main thread as transferable typed arrays. |
| Tooling | mise, pnpm, hk, Vitest, ESLint, Prettier, markdownlint-cli2 | mise pins tool versions; hk runs every linter and the pre-commit hook. |

TypeScript is pinned to 6.0.x because typescript-eslint and svelte-check don't support TS 7 yet.

## Layout

```text
src/
  sim/      pure TS physics (no DOM / Three.js imports) — port of model/physics
  stats/    statistics + Formulas — port of model/statistics
  io/       .set file load/save — port of model/io
  worker/   simulation Web Worker + message protocol
  render/   Three.js scene (1D/2D/3D views, color modes, periodic ghosts, trace)
  ui/       Svelte components (App.svelte = root)
  charts/   Canvas2D histogram / history plots
```

Java sources referenced above live in `../boltzmann3d/src/edu/byu/chem/boltzmann/`. Presets (`*.set`) are in `resources/simsettingsfiles/presets/`. The rendering behaviours to preserve are listed in `../boltzmann3d/docs/rendering-baseline.md`.

## Commands

Tool versions (node, pnpm, hk, pkl, markdownlint-cli2) are pinned in `mise.toml`. Run `mise install` once; it also runs `pnpm install`. Run `hk install` once to enable the git pre-commit hook.

- `pnpm dev`: start the dev server
- `pnpm build`: type-check (svelte-check), then build the production bundle
- `pnpm test`: run Vitest; tests sit next to the code as `*.test.ts`
- `pnpm lint` / `mise run lint`: run every hk check on all files: ESLint (TS + Svelte rules), svelte-check (types), Prettier, markdownlint-cli2
- `pnpm format` / `mise run fix`: apply every hk fixer on all files

Linters are configured in `hk.pkl`, plus `eslint.config.js`, `.prettierrc` and `.markdownlint-cli2.jsonc`. The pre-commit hook runs the same steps on staged files and auto-fixes them.

Run `pnpm build && pnpm test && pnpm lint` before calling work done.

## Porting rules

- Port file by file. Keep the Java class, method and field names, adapted to TS conventions, so the code can be compared with the original side by side.
- `src/sim` and `src/stats` must stay pure: no DOM, no Three.js. They run in a Worker and in Node tests.
- Physics changes need parity tests against reference dumps from the Java app (same preset and seed, N events, positions and velocities within a set tolerance).

## Plans

- Active plans go in `.agents/plans/` as `NNNN-short-slug.md`.
- When a plan is complete, move it to `.agents/archived-plans/`.
- Read the active plans before starting larger work.
