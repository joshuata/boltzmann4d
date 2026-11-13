# Boltzmann 4D

A web port of [Boltzmann 3D](https://github.com/byu-chem/boltzmann3d) (vendored as a git submodule in `vendor/boltzmann3d`), a kinetic theory demonstrator. It runs an event-driven hard-sphere gas simulation in 1D, 2D and 3D.

```sh
pnpm install
pnpm dev
```

The home page lists the bundled presets; each runs at its own URL (`/simulate/2Deffuse`), and picking another in the sidebar moves to its page. `?render=main` draws on the main thread instead of the render worker.

## Sharing and embedding scenarios

The scenario editor's **Share** panel gives a link to `/shared#v1.…` that runs the scenario in the simulator. The whole scenario is in the fragment after `#` (deflated JSON in base64url, see `packages/simulation-editor/src/scenario-link.ts`), so nothing is stored on a server and the link works on the static GitHub Pages site.

The same panel gives an iframe snippet for embedding the scenario in another page. Its link has `?embed` before the `#`, which hides the site's navbar; the page offers to open the scenario in a new tab instead:

```html
<iframe
  src="https://joshuata.github.io/boltzmann4d/shared?embed#v1.…"
  title="Hot and cold gases"
  width="100%"
  height="640"
  style="border: 0"
  allow="fullscreen"
></iframe>
```

`?embed` works on any page of the site, e.g. `/simulate/2Deffuse?embed` embeds a bundled preset.

The repo is a pnpm workspace: `packages/engine` (physics, statistics, settings files), `packages/simulator` (the viewer), `packages/simulation-editor` and the SvelteKit site in `apps/web`.

See [AGENTS.md](AGENTS.md) for the architecture and contributor notes. Licensed under GPL-3.0.
