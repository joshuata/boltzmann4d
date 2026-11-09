# boltzmann4d: Stack Choice and Migration Plan

## Scope of this session

1. Write `AGENTS.md` and `CLAUDE.md`, and create the `.agents/plans/` and `.agents/archived-plans/` folders, with a `.gitkeep` in `archived-plans`.
2. Save this plan as `.agents/plans/0001-stack-and-migration.md`.
3. Build a simple skeleton project:
   - Scaffold a Vite + Svelte 5 + TypeScript project with pnpm.
   - Add Three.js and Vitest. Add ESLint and Prettier with minimal configs.
   - Create empty module folders (`sim`, `stats`, `io`, `worker`, `render`, `ui`, `charts`). Each gets an `index.ts` stub, except `ui`, which holds `App.svelte`.
   - `App.svelte` renders a Three.js canvas, using a placeholder orthographic scene with a few circles, next to an empty control panel.
   - Add a trivial Vitest test. Extend `.gitignore` for node and Vite.
   - Check that `pnpm install`, `pnpm build`, `pnpm test` and `pnpm lint` pass, and that `pnpm dev` serves the page.
4. Make no commits unless asked.

Later sessions cover migration steps 2–8 below.

## Context

boltzmann4d is a TypeScript web migration of `../boltzmann3d`. That app is a Java 25 + Swing + LWJGL kinetic-theory teaching app with about 38.8k lines across 176 files.

The original app's core is a custom event-driven hard-sphere simulation:

- `Calendar.java` holds the pairwise event table and heap.
- `Physics.java` runs the main event loop.
- `Particle{1D,2D,3D}.java` handle collision prediction per dimension.

The simulation covers pistons, thermostats, dividers and holes, energy wells, reactions and time reversal. Scenes come in 1D, 2D and 3D, with typically 25–200 particles. The goal is to keep the simulation equations and results unchanged. The code itself does not need to hold closely to the Java version: refactor where and when it makes sense.

## Deliverable

The finished product is the app deployed as a static site on GitHub Pages, served from this repository (`https://joshuata.github.io/boltzmann4d/`). Everything runs in the browser: no server, no backend, and presets, the worker and assets are all bundled by Vite. Choices made along the way should keep that working:

- Vite's `base` must match the Pages path (`/boltzmann4d/`), and asset, worker and preset URLs must resolve under it.
- Deploy from CI with GitHub Actions (build, test, lint, then publish `dist/`) on every push to `main`.

## Decisions

- **Physics: no engine.** Port the event-driven simulation to TypeScript as it is. A general engine (Matter.js, Planck, Rapier) uses fixed time steps and soft contacts, so it would change the results and drop wells, reactions and time reversal.
- **Rendering: Three.js.**
  - 3D: perspective camera, lit spheres drawn with `InstancedMesh`, orbit controls.
  - 1D/2D: orthographic camera with point sprites or circles.
  - Trace mode uses two render targets, matching the original.
- **UI: Svelte 5 + Vite + TypeScript.** Svelte suits the dialogs and form-heavy settings.
- **Charts:** custom Canvas2D components that port `StatPanel`, `HistogramBins` and `History`. uPlot is a fallback for the history plots.
- **Threading:** run physics in a Web Worker and send `RenderFrame`-style snapshots to the main thread as transferable `Float64Array`s. This mirrors `ThreadController`.
- **Tooling:** pnpm, Vitest, ESLint and Prettier. Deployment is a static build on GitHub Pages (see Deliverable). The licence stays GPL-3.0, since this is a derivative work.

## Proposed layout

```text
src/
  sim/        # pure TS, no DOM: Calendar, Physics, Particle1D/2D/3D, Piston, Thermostat, Wall*, ArenaInfo, Collision
  stats/      # StatisticID, statistics/*, Formulas, HistogramBins, History
  io/         # .set loader/saver (port of Load.java/Save.java); presets/*.set copied verbatim
  worker/     # sim.worker.ts + message protocol
  render/     # Three.js scene, 1D/2D/3D views, color modes, periodic ghosts, trace
  ui/         # Svelte components: MainView, SimSettings, StatsSettings, PlotSettings, Reservoir, Piston dialogs
  charts/     # Canvas histogram/history
```

## Agent-agnostic repo conventions (do first)

- **`AGENTS.md`** at the repo root is the single source of project context for any coding agent. It covers:
  - Purpose and origin (`../boltzmann3d`).
  - The chosen stack and the reasons behind each choice (the Decisions above).
  - The directory layout.
  - Commands: `pnpm dev`, `pnpm test`, `pnpm lint`.
  - The rule that the physics must match while the code may be refactored freely, and the parity-test requirement.
  - The plan conventions listed below.
- **`CLAUDE.md`** contains only a pointer to `AGENTS.md` (an `@AGENTS.md` import), plus a note that this file is for Claude-specific context only and everything else belongs in `AGENTS.md`.
- **Plans:**
  - Active plans live in `.agents/plans/`; completed plans move to `.agents/archived-plans/`.
  - Copy this plan into `.agents/plans/0001-stack-and-migration.md`.
  - `AGENTS.md` documents this workflow.
- Save a memory recording this preference, so future sessions put plans and context in the right place.

## Migration order

1. Scaffold the project: Vite + Svelte + TS, with Vitest, lint and CI. _Done; CI runs from `.github/workflows/ci.yml`._
2. Port `sim/`, starting with 2D, then 1D and 3D. Use the Java structure as a starting point, but refactor where and when it makes sense; parity tests, not matching code layout, show the port is correct.
3. Write a `.set` parser and load all 27 presets from `boltzmann3d/src/edu/byu/chem/boltzmann/resources/simsettingsfiles/presets/`.
4. Build a headless parity harness:
   - Add a small Java runner to boltzmann3d that runs a fixed seed and preset for N events and writes positions and velocities.
   - Compare the TypeScript output against it within a set tolerance.
   - This is the main correctness gate.
5. Port the statistics and Formulas, then test the histogram output against Maxwell–Boltzmann theory.
6. Build the Worker and the Three.js renderer, following `docs/rendering-baseline.md` from boltzmann3d.
7. Port the Svelte UI: main panel controls, then the settings dialogs, then charts.
8. Port the remaining modes: piston, Maxwell demon, reactions, thermostat and trace.
9. Deploy to GitHub Pages: set Vite's `base`, add a GitHub Actions workflow that builds, tests, lints and publishes `dist/`, and enable Pages for the repository. This can be set up early so every step above ships as it lands. _Done: the workflow and `base` are in place (`.github/workflows/ci.yml`), and Pages is enabled with GitHub Actions as its source._

## Verification

- **Unit tests:** Vitest on the pure `sim/` code (event prediction, conservation of energy and momentum).
- **Parity tests:** TypeScript against the Java reference dumps for several presets across 1D, 2D and 3D.
- **Statistics check:** the speed histogram should match the theoretical curve within tolerance.
- **Deployed check:** the GitHub Pages site loads, runs the simulation and opens every preset, with no failed requests in the browser console.
- **Manual check:** run `pnpm dev`, load each preset, and compare visually with the Java app against the rendering-baseline checklist.
