# 0009: Application shell

_In progress._ The site around `<Simulator>` in `apps/web`: navigation, site-level pages, failure handling and deployment polish. Sidebar panels are roadmap 0006 Phase 1, not this plan.

## Context

The shell today has a navbar with 2D/3D preset menus, a home page listing the presets, `/simulate/[preset]`, and placeholder `/upload` and `/editor` pages. There is no error page, no Help/About, and no static assets (favicon, manifest).

Uploading settings (FILE-1), saved setups (FILE-2) and sharing belong to plan 0008 (the simulation-editor session), including the `<Simulator>` props and worker-protocol changes they need. Sharing is file only, with no setups encoded in URLs. This plan may link to `/upload` from the navbar but doesn't change that page, `/editor`, the `<Simulator>` props or the worker protocol.

## Steps, in priority order

1. **Errors.** A site `+error.svelte` for unknown routes and presets (adapter-static already writes `404.html` as the fallback, so GitHub Pages shows it). In the simulator, a clear message over the arena when the browser can't run it (no Web Workers or WebGL 2) or when the physics or render worker crashes, with a Reload button.
2. **About and Help (HELP-1).** _Done._ Docs are Markdown files in `apps/web/src/docs/*.md`, compiled by mdsvex; each becomes `/docs/<name>`, with its title, description and menu order in the frontmatter. A Quick start and an About page (credits to the original BYU authors, GPL-3.0, links to the original manual, quick start guide and worksheets, and the source). The navbar's Help menu lists the docs (in a new tab on a simulation page, so it keeps running) and opens About in a dialog with the build date and commit. Still to write: our own manual and classroom guides, ported from the original manual as the features land.
3. **Navbar at phone width.** Show the current simulation's name; collapse the menus into a sheet on narrow screens; add Upload, About and the repository link.
4. **Home page.** A one-line description of what each preset demonstrates, grouped by topic, linked to its `SCN-*` scenario where there is one.
5. **Presentation mode.** Fullscreen and a hide-sidebar toggle for projectors.
6. **Metadata and offline use.** Favicon, page descriptions, a web manifest, and a service worker so the site works offline once visited.

## Out of scope

- `/upload`, saved setups, sharing and the editor: plan 0008.
- Arena colour schemes (VIEW-1): roadmap 0006 Phase 9.
