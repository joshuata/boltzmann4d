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
| Site | SvelteKit (adapter-static) | Routes for choosing a simulation, uploading settings and the simulation editor. Every page is prerendered and runs client-only (`ssr = false`), so it stays a static GitHub Pages site. |
| Workspaces | pnpm workspaces, packages consumed as source | The engine is reusable without the UI; no package has its own build step, the app's Vite compiles them. |
| Components | shadcn-svelte (Bits UI) + Tailwind v4 | Accessible dialogs, menus, selects, sliders and checkboxes that work with keyboard and touch. The components are copied into `packages/ui` (we own and restyle them), and shadcn-svelte's charts are built on LayerChart too. |
| Charts | LayerChart | Svelte-native chart components (Svelte 5), so charts are built in Svelte rather than hand-drawn on a canvas. Replaces `StatPanel`'s drawing; the binning (`HistogramBins`, `History`) is ported in `packages/engine/src/stats`. |
| Threading | Physics worker + render worker | Physics mirrors `ThreadController`. Three.js draws on an `OffscreenCanvas` in its own worker; frames go physics → renderer directly over a `MessageChannel` as transferable typed arrays, so the main thread only runs the UI. `?render=main` (and browsers without `OffscreenCanvas`) draw on the main thread instead. |
| Tooling | mise, pnpm, hk, Vitest, ESLint, Prettier, markdownlint-cli2 | mise pins tool versions; hk runs every linter and the pre-commit hook. |

TypeScript is pinned to 6.0.x because typescript-eslint and svelte-check don't support TS 7 yet.

## Layout

```text
packages/
  engine/              @boltzmann4d/engine: pure TS, no DOM lib, no Three.js
    src/sim/           physics — port of model/physics (parity fixtures in sim/parity/)
    src/stats/         statistics + Formulas — port of model/statistics
    src/io/            .set file parsing (Ohm grammar) and loading, plus the bundled presets — from model/io
    src/scenario/      scenarios, the web app's JSON format for a simulation setup: Zod schema and validation, .set ⇄ JSON, resolving into the starting state
    src/utils/         shared pure helpers (unit conversions) — from utils
  simulator/           @boltzmann4d/simulator: the viewer, exported as <Simulator>
    src/Simulator.svelte  arena canvas + sidebar
    src/worker/        physics Web Worker + message protocol
    src/render/        Three.js scene (1D/2D/3D views, color modes, periodic ghosts, trace) + render worker
    src/ui/            sidebar Svelte components and SimulationClient
    src/charts/        statistics charts (LayerChart Svelte components)
  simulation-editor/   @boltzmann4d/simulation-editor: the scenario editor (SVG drawing canvas and panels), exported as <SimulationEditor> (plan 0010)
  ui/                  @boltzmann4d/ui: shadcn-svelte components (src/components/ui) and the Tailwind theme (src/theme.css)
apps/
  web/                 @boltzmann4d/web: SvelteKit site — navbar (2D/3D simulation menus, Help), / (preset list), /simulate/[preset], /upload, /editor, /docs
    src/docs/          user documentation as Markdown (mdsvex); each file is a page at /docs/<name>
scripts/, benchmarks/  Node-side profiling, benchmarks and reports (import the engine package)
```

Dependencies only point down: `web → simulator, simulation-editor → engine`, and the Svelte packages use `ui`. Packages export their `src/` files directly (`exports` in each `package.json`); import the engine as `@boltzmann4d/engine/sim`, `@boltzmann4d/engine/io/presets` and so on, never by relative path across packages.

Java sources referenced above live in `vendor/boltzmann3d/src/edu/byu/chem/boltzmann/`. Presets (`*.set`) are in `resources/simsettingsfiles/presets/`. The rendering behaviours to preserve are listed in `vendor/boltzmann3d/docs/rendering-baseline.md`.

## Commands

Tool versions (node, pnpm, hk, pkl, markdownlint-cli2, gh) are pinned in `mise.toml`. Run `mise install` once; it also installs `node_modules`. After that, `mise run <task>` reinstalls `node_modules` automatically whenever `package.json` or `pnpm-lock.yaml` changes (mise's `[deps.pnpm]` provider). Calling `pnpm` directly doesn't, so run `mise deps` after pulling if you skip `mise run`. Run `hk install` once to enable the git pre-commit hook. In VS Code, open `boltzmann4d.code-workspace` rather than the repo folder: the Svelte extension only finds each package's dependencies (and SvelteKit's `./$types`) when that package is its own workspace folder.

- `pnpm dev`: start the SvelteKit dev server (`apps/web`)
- `pnpm build`: type-check every workspace (`pnpm -r run check`: svelte-check, or tsc for the engine), then build the static site into `apps/web/build/`
- `pnpm test`: run Vitest over every package (`vitest.config.ts` lists them as projects); tests sit next to the code as `*.test.ts`
- `pnpm --filter <package> …`: run a command in one workspace, e.g. `pnpm --filter @boltzmann4d/engine exec vitest`
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

`.github/workflows/ci.yml` runs `mise run lint`, `mise run test` and `mise run build` on every pull request and on pushes to `main`. On `main` it then deploys `apps/web/build/` to GitHub Pages at `https://joshuata.github.io/boltzmann4d/`.

Production builds use the base path `/boltzmann4d/` (`paths.base` in `apps/web/vite.config.ts`, where SvelteKit 3 keeps its config); the dev server stays at `/`. Link between pages with `resolve()` from `$app/paths`, and load assets through Vite (imports, `?worker`, `?raw`, `import.meta.glob`), so URLs keep working under that path. To check a production build locally, run `pnpm build && pnpm preview` and open `http://localhost:4173/boltzmann4d/`.

## UI rules

- The whole sidebar is Svelte: controls, readouts and charts are Svelte components (charts via LayerChart), with no hand-built DOM or canvas drawing.
- Sidebar components get their data from the main visualization component, the `SimulationClient` that `Simulator.svelte` creates for the canvas (`packages/simulator/src/ui/simulation.svelte.ts`). They read its reactive state and call its methods; they never talk to the physics or render workers directly.
- New data for the sidebar (statistics, timing, …) goes through `SimulationClient`: the worker sends it, the client exposes it as `$state`, and components receive it as props.
- The site owns navigation and the URL: the navbar's 2D and 3D menus link to `/simulate/[preset]`, and `<Simulator>` just takes `preset`, or a `scenario` object the page supplies (e.g. `/upload` from a file the user opened), and loads a new one in place when the prop changes. The simulator package never touches `location` or `history` (except reading `?render=main`).
- User documentation lives in `apps/web/src/docs/*.md`, written in Markdown and compiled by mdsvex. Frontmatter sets `title` (the page heading, so don't add a `#` heading), `description` and `order`. Link between docs with relative links (`[About](about)`) so they work under the base path.
- Build controls from `@boltzmann4d/ui` (`import { Button } from '@boltzmann4d/ui/button'`) and style with Tailwind classes and the theme tokens (`bg-muted`, `text-muted-foreground`, `border`, …) rather than `<style>` blocks or hard-coded colours. Add components with `pnpm dlx shadcn-svelte@latest add <name>` run in `packages/ui` (its `components.json` sets the aliases); the generated files keep the CLI's kebab-case names. Dark mode follows the system setting. The site's `app.css` imports the theme and tells Tailwind to scan `packages/`, so classes used in any package are generated.
- This keeps the UI ready for other devices: components only depend on reactive state, so the layout can change with screen size (phones, tablets, desktop) without touching data flow. Sidebar components must work at narrow widths and with touch input.

## Porting rules

- The Java code is a reference, not a template. Restructure, rename, merge or split classes, and drop dead code, Swing leftovers and quirks whenever that makes the TypeScript clearer. Keeping a Java name is fine when it helps someone find the original, but it isn't required.
- When a refactor touches physics, prove the results are unchanged with parity tests (below).
- Keep the physics benchmarkable and profilable: synchronous, deterministic and headless (no timers, randomness, DOM or logging inside `packages/engine/src/sim`), with `*.bench.ts` benchmarks for hot paths. See plan 0002.
- Name `.ts` files in kebab-case (`thread-controller.ts`) and Svelte components in PascalCase (`PlayPauseButton.svelte`). ESLint enforces this.
- `packages/engine` must stay pure: no DOM, no Three.js, no imports from other workspaces. It runs in a Worker and in Node tests. Its tsconfig has no DOM lib, so `svelte-check`/`tsc` catch browser APIs.
- Physics changes must keep `packages/engine/src/sim/parity.test.ts` green: the engine reproduces the Java app's events and final states bit for bit from the same initial state (fixtures in `packages/engine/src/sim/parity/`).

## Specs

- `docs/specs/` lists what the app must do, extracted from the original Boltzmann 3D manual and worksheets, with requirement IDs (`SIM-3`, `STAT-12`, …) and classroom stories (user stories, `docs/specs/stories.md`) to check against. Read the relevant spec before building a feature, and cite its IDs in plans.

## Skills

- Agent skills live in `.agents/skills/<name>/SKILL.md`; `.claude/skills/<name>` is a symlink to each one so Claude Code finds it.
- `feature-plan`: investigate a feature idea and, once approved, file a GitHub issue with an implementation plan attached. Read-only: it never changes code.

## Plans

- Active plans go in `.agents/plans/` as `NNNN-short-slug.md`.
- When a plan is complete, move it to `.agents/archived-plans/`.
- Read the active plans before starting larger work.
