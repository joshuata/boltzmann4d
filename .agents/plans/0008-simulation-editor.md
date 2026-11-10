# 0008: Simulation editor and scenario JSON

_In progress: steps 1–3 are done; next is step 4 (the editor)._ Follows the workspace split (plan 0007), which left `packages/simulation-editor` and the `/editor` and `/upload` routes as placeholders.

## Goal

Teachers and students can build their own simulation (arena, species, counts, temperatures, modes), run it, save it and share it, without editing `.set` files by hand.

## Decisions so far (agreed 2026-11-09)

- The web app's own format for a simulation setup is a **new JSON schema**, defined and validated in the engine (`packages/engine/src/scenario`).
- `.set` stays supported for **import and export**, so FILE-6 (`docs/specs/files-and-output.md`) still holds: files saved here load in the Java app and Java-saved files load here. The `.set` writer is the one roadmap 0006 Phase 8 plans; whichever lands first does it.
- Uploads stay in the browser (static site): files are read client-side and kept in IndexedDB.

## Decisions (agreed 2026-11-10)

- A simulation setup is called a **scenario** (`Scenario`, `packages/engine/src/scenario`, format `boltzmann4d-scenario`). "Settings" is reserved for the application's own settings. The classroom walkthroughs in `docs/specs/` became **stories** (`stories.md`, `STORY-*`).

- Particles are stored as **recipes plus optional explicit particles**, mirroring `.set`: each particle group has a colour, mass, radius, optional temperature, randomly placed blocks (count, average speed) and explicitly placed particles (position, speed, optional angles). Positions are generated when a scenario loads, so `.set → JSON → .set` loses nothing and the editor edits counts and temperatures.
- The schema is written with **Zod 4** in `packages/engine/src/scenario`: one source for the TS types and the validator, with readable error paths.
- `loadSetFile` (`.set` text) is `.set → JSON → validate → resolve`, so `.set` and JSON files share one code path into `ResolvedScenario` (formerly `SimulationSettings`).
- Sharing is **by file only** (download and send). No URL-encoded scenarios.
- Saved scenarios live **in the browser, in IndexedDB** (not localStorage: scenarios with explicit particles can be large, and IndexedDB stores structured data asynchronously). The editor saves named scenarios there, `/upload` lists them alongside opening a file, and the user can mark one as their default (FILE-2).

## Work

1. Engine (first PR, done): JSON schema and types for scenarios, a validator with readable errors, and `.set ⇄ JSON` conversion with round-trip tests over every bundled preset.
2. Worker protocol (done): `connect`/`load` take a `ScenarioSource`, a bundled preset or a scenario object, and `<Simulator>` takes a `scenario` prop. Presets are converted to scenarios when loaded (`loadPresetScenario`).
3. Site (done): `/upload` opens a `.json` or `.set` file (FILE-1's file picker, or drag and drop), lists every problem if it can't, and runs it. Storing it moves to step 5.
4. Simulation editor: a form-based editor over the schema (start from any preset), with live validation, run, and download as `.json` or `.set`. Works at narrow widths and with touch (AGENTS.md UI rules).
5. Saved scenarios: an IndexedDB store of named scenarios (JSON), including opened files, listed on `/upload` with a route to run one, and a user default (FILE-2).

## Open questions

- Which SIM/PART/FILE requirements the first editor version covers.
