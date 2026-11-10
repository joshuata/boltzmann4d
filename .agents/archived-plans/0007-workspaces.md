# 0007: Split into pnpm workspaces (engine, simulator, simulation editor, SvelteKit app)

_Done: the workspaces landed as described below._

## Context

Today everything is one Vite + Svelte app in `src/`. The goal is a multi-workspace repo so that a SvelteKit app can host simulation selection, spec upload and a new simulation editor (the "map-maker"), with the physics reusable on its own. Decisions (agreed 2026-11-09):

- Split the simulation side into **engine** (pure TS) and **simulator** (Svelte viewer).
- Editor specs will be a **new JSON schema** (designed in plan 0008, not here). Note FILE-6 (`docs/specs/files-and-output.md`) requires saved files to stay `.set`-compatible with the Java app, so 0008 makes JSON the web format with `.set` import and export (agreed) (roadmap 0006 Phase 8 already plans the writer).
- The "map-maker" is named the **simulation editor** (`@boltzmann4d/simulation-editor`, route `/editor`). Its files are still called _settings files_ in the docs, matching the `SimulationSettings` type.
- SvelteKit app is **static, client-only** (adapter-static, GitHub Pages); uploads stay in the browser.
- The simulation editor is **scaffold only** in this migration.

This migration is mechanical: no physics or behaviour changes, parity stays bit-for-bit.

## Target layout

```text
pnpm-workspace.yaml        packages: [packages/*, apps/*]
package.json               root: shared dev tooling, `pnpm -r` scripts, depends on engine for scripts/
tsconfig.base.json         shared compiler options (from today's tsconfig.json)
eslint.config.js           one root config, globs updated
mise.toml, hk.pkl          paths updated
scripts/, benchmarks/      stay at root; import @boltzmann4d/engine instead of ../src
packages/
  engine/      @boltzmann4d/engine     src/{sim,stats,io,utils} + parity fixtures + *.test/*.bench
  simulator/   @boltzmann4d/simulator  src/{worker,render,ui,charts}, app.css; exports Simulator.svelte
  simulation-editor/ @boltzmann4d/simulation-editor  src/SimulationEditor.svelte placeholder; depends on engine only
apps/
  web/         @boltzmann4d/web        SvelteKit + adapter-static
```

Dependency direction: `web → simulator, simulation-editor → engine`. Engine never imports the others.

## Steps

1. **Workspace skeleton.** `pnpm-workspace.yaml` gets `packages:` (keep `allowBuilds`). Root `package.json` keeps the shared devDeps (eslint, prettier, typescript 6.0.x, vitest, svelte-check, tsx) and scripts `build/test/check/dev` as `pnpm -r`/`--filter` calls. Move shared options to `tsconfig.base.json`.
2. **Engine package.** `git mv src/{sim,stats,io,utils} packages/engine/src/`. Packages are consumed as source (no build step): `exports` map `.`, `./sim`, `./stats`, `./io`, `./utils/units` to `.ts` files. Its tsconfig drops the `dom` lib so purity is enforced by the compiler, not just convention (fix any fallout; there should be none per the porting rules). `io/presets.ts` keeps `import.meta.glob`/`?raw` (types: `vite/client`). Own `vitest.config.ts` (environment `node`). Deps: `ohm-js`.
3. **Simulator package.** `git mv src/{worker,render,ui,charts} src/app.css packages/simulator/src/`. Rename `ui/App.svelte` → `Simulator.svelte` with a `preset` prop (initial preset; `PresetPicker` stays inside for now). Rewrite `../sim`, `../io`, `../stats`, `../utils` imports to `@boltzmann4d/engine/...` (≈45 imports, listed by `grep -rhoE "from '(\.\./)+[a-z]+" src`). `?worker` imports stay; they resolve when the consuming app's Vite compiles the package source. `exports` with the `svelte` condition. Deps: `three`, `layerchart`, engine `workspace:*`. Delete `index.html` and `src/main.ts`.
4. **Simulation-editor package.** Placeholder `SimulationEditor.svelte` ("coming soon" + reads `presetCatalog` from engine to prove the dependency). Real editor and JSON spec go in plan 0008.
5. **SvelteKit app (`apps/web`).** `adapter-static`, `paths.base = '/boltzmann4d'` in production (dev stays `/`), `vite.worker.format = 'es'`. Root `+layout.ts`: `ssr = false`, `prerender = true` (workers, Three.js and `OffscreenCanvas` are browser-only). Routes:
   - `/` lists `presetCatalog` grouped by dimension, links to `/simulate/[preset]`.
   - `/simulate/[preset]` mounts `<Simulator preset={…}>`; `entries()` prerenders every preset.
   - `/upload` placeholder (stores nothing yet; wired up in 0008; covers FILE-1's file picker).
   - `/editor` mounts `<SimulationEditor>`. Global `app.css` imported from the layout. `?render=main` keeps working (read from `location.search` in `SimulationClient`).
6. **Tooling.**
   - Vitest: root `vitest.config.ts` with `test.projects: ['packages/*']`; `mise run test:parity` → `pnpm --filter @boltzmann4d/engine exec vitest run src/sim/parity.test.ts`.
   - svelte-check: each Svelte package and the app get a `check` script; hk's step becomes `pnpm -r run check` (app runs `svelte-kit sync` first).
   - ESLint: globs move from `src/**` to `packages/*/src/**` and `apps/web/src/**`; exempt `apps/web/src/routes/**` from the PascalCase rule (`+page.svelte`); ignore `.svelte-kit/`, `build/`.
   - `.prettierignore` / `.gitignore`: add `.svelte-kit`, `apps/web/build`.
   - mise: `java:parity` writes to `packages/engine/src/sim/parity`; `web:bench`, `build` sources/outputs updated; `profile` path unchanged (root scripts). `scripts/tsconfig.json` points at the engine package; `profile.ts` reads presets from `packages/engine/src/io/simsettingsfiles`.
7. **CI.** Same three `mise run` steps; Pages artifact path becomes `apps/web/build`.
8. **Docs.** Update `AGENTS.md` (Stack table: SvelteKit; Layout; Commands; UI rules now name `packages/simulator/src/ui/simulation.svelte.ts`; purity rule: "engine has no DOM lib"), `README.md`, and save this plan as `.agents/plans/0007-workspaces.md` (0006 is the spec roadmap on `main`; rebase onto `main` first). Update roadmap 0006's paths (`src/io` → `packages/engine/src/io`, etc.). Add `.agents/plans/0008-simulation-editor.md` stub: JSON settings schema in engine (`engine/src/settings`, validator, `.set ⇄ JSON` per FILE-6), worker loads settings instead of a preset name, upload route stores them in IndexedDB, the editor itself.

## Critical files

- `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `vite.config.ts`, `svelte.config.js`, `eslint.config.js`, `hk.pkl`, `mise.toml`, `.github/workflows/ci.yml`
- `src/ui/App.svelte` (→ `Simulator.svelte`), `src/ui/simulation.svelte.ts`, `src/worker/sim.worker.ts`, `src/io/presets.ts`
- `scripts/profile.ts`, `scripts/bench-scaling.ts`, `scripts/tsconfig.json`
- `AGENTS.md`

## Verification

- `mise run lint && mise run test && mise run build` (what CI runs) pass; `mise run test:parity` passes with fixtures unchanged (`git diff --stat packages/engine/src/sim/parity` empty).
- `git log --follow` on a moved file shows its history (moves done with `git mv`).
- `mise run profile 2Dmixture --events 10000` still writes a profile.
- `pnpm --filter @boltzmann4d/web preview`, open `http://localhost:4173/boltzmann4d/` in the browser pane: catalog lists presets; `/simulate/2Dmixture` and `/simulate/3Dequil` render and animate, statistics panel fills, no console errors, both worker chunks load under the base path; `?render=main` also draws; `/editor` and `/upload` show their placeholders; deep-linking a route directly works (prerendered).
