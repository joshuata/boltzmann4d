# 0008: Simulation editor and settings JSON

_In progress: step 1 (engine schema and conversion)._ Follows the workspace split (plan 0007), which left `packages/simulation-editor` and the `/editor` and `/upload` routes as placeholders.

## Goal

Teachers and students can build their own simulation (arena, species, counts, temperatures, modes), run it, save it and share it, without editing `.set` files by hand.

## Decisions so far (agreed 2026-11-09)

- The web app's own settings format is a **new JSON schema**, defined and validated in the engine (`packages/engine/src/settings`).
- `.set` stays supported for **import and export**, so FILE-6 (`docs/specs/files-and-output.md`) still holds: files saved here load in the Java app and Java-saved files load here. The `.set` writer is the one roadmap 0006 Phase 8 plans; whichever lands first does it.
- Uploads stay in the browser (static site): files are read client-side and kept in IndexedDB.

## Decisions (agreed 2026-11-10)

- Particles are stored as **recipes plus optional explicit particles**, mirroring `.set`: each particle group has a colour, mass, radius, optional temperature, randomly placed blocks (count, average speed) and explicitly placed particles (position, speed, optional angles). Positions are generated when settings load, so `.set → JSON → .set` loses nothing and the editor edits counts and temperatures.
- The schema is written with **Zod 4** in `packages/engine/src/settings`: one source for the TS types and the validator, with readable error paths.
- `loadSettings` (`.set` text) becomes `.set → JSON → validate → resolve`, so `.set` and JSON files share one code path into `SimulationSettings`.
- Sharing is **by file only** (download and send). No URL-encoded setups.
- Saved setups live **in the browser, in IndexedDB** (not localStorage: setups with explicit particles can be large, and IndexedDB stores structured data asynchronously). The editor saves named setups there, `/upload` lists them alongside opening a file, and the user can mark one as their default (FILE-2).

## Work

1. Engine (first PR): JSON schema and types for settings, a validator with readable errors, and `.set ⇄ JSON` conversion with round-trip tests over every bundled preset.
2. Worker protocol: load settings (JSON) instead of only a preset name; presets become JSON produced from the bundled `.set` files.
3. Site: `/upload` opens a `.json` or `.set` file (FILE-1's file picker), stores it, and runs it; a route to run a stored or shared setup.
4. Simulation editor: a form-based editor over the schema (start from any preset), with live validation, run, and download as `.json` or `.set`. Works at narrow widths and with touch (AGENTS.md UI rules).
5. Saved setups: an IndexedDB store of named setups (JSON), listed on `/upload`, with a user default (FILE-2).

## Open questions

- Which SIM/PART/FILE requirements the first editor version covers.
