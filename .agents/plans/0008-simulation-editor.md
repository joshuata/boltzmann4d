# 0008: Simulation editor and settings JSON

_Not started._ Follows the workspace split (plan 0007), which left `packages/simulation-editor` and the `/editor` and `/upload` routes as placeholders.

## Goal

Teachers and students can build their own simulation (arena, species, counts, temperatures, modes), run it, save it and share it, without editing `.set` files by hand.

## Decisions so far (agreed 2026-11-09)

- The web app's own settings format is a **new JSON schema**, defined and validated in the engine (`packages/engine/src/settings`).
- `.set` stays supported for **import and export**, so FILE-6 (`docs/specs/files-and-output.md`) still holds: files saved here load in the Java app and Java-saved files load here. The `.set` writer is the one roadmap 0006 Phase 8 plans; whichever lands first does it.
- Uploads stay in the browser (static site): files are read client-side and kept in IndexedDB.

## Work

- Engine: JSON schema and types for settings, a validator with readable errors, and `.set ⇄ JSON` conversion with round-trip tests over every bundled preset.
- Worker protocol: load settings (JSON) instead of only a preset name; presets become JSON produced from the bundled `.set` files.
- Site: `/upload` opens a `.json` or `.set` file (FILE-1's file picker), stores it, and runs it; a route to run a stored or shared setup.
- Simulation editor: a form-based editor over the schema (start from any preset), with live validation, run, and download as `.json` or `.set`. Works at narrow widths and with touch (AGENTS.md UI rules).

## Open questions

- How to share a setup by link (encoded in the URL vs. a file only).
- Which SIM/PART/FILE requirements the first editor version covers.
