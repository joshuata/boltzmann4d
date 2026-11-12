# 0016: Reaction readouts and the equilibrium prediction (roadmap Phase 7)

Roadmap Phase 7 (`0006-spec-roadmap.md`), tracked in #71.

Requirements: SIM-27, 28, 29; PRED-12–14; STAT-1 (Number of Particles as reaction mode's default). Unlocks STORY-26 and 27, and the counts for STORY-33.

Reactions already run in 2D and 3D (`packages/engine/src/sim/reactions.ts`, parity-checked in 2D), and the editor's rule table works. What's missing is what students see.

## Design

**Reactions in 3D.** `Particle3D` already reacts (a web-port addition); only the scenario layer kept them off, because the Java app never ran reactions in 3D. The manual's STORY-26 and PRED-14 expect `3Dequil` to react (14.1 products out of 50), so:

- `migrateV1` runs `reaction_mode TRUE` in 3D too (still only with no Type B particles at the start, SIM-25), and `toV1` stops warning about it.
- The worker's Reactions switch (`canReact`) works in 3D.
- No new parity fixtures: Java has nothing to compare against in 3D, and the 2D code path is unchanged.

**The prediction (PRED-12–14)**, `reactionEquilibrium` in `packages/engine/src/stats/formulas.ts`: the microcanonical sum over product counts `N₂` with the parity of the starting count, of `C(N, N₂) · [E − N₂ ΔE/2]^{dN/2 − 1}`, in logs so 1000 particles don't overflow. `E` is the total energy with the reactant as zero (kinetic energy plus `N₂ ΔE/2` for the products present), so it can be computed at any moment. Returns `<N₂>` and its width `sqrt(<N₂²> − <N₂>²)`. It applies to the Java shape only: one enabled rule `X + X ⇌ Y + Y`, reverse not suppressed, every particle X or Y, and X and Y of equal mass. Otherwise there is no prediction (the readout says why).

**The meter** (`ReactionMeter`, `packages/engine/src/stats/reaction-meter.ts`): counts per kind kept exactly event by event. Before each particle–particle event it notes the two particles' kinds, and after it updates the counts if they changed, so a readout costs nothing per particle. It keeps:

- the live counts;
- a time-weighted average and width of every kind's count since the averaging started (from the start of the run, or since the user pressed "Reset average", for when the gas has reached equilibrium);
- for every kind, the first time its count reached each value, so "time to N products" (STORY-27) can be answered for any N without rerunning;
- the prediction, recomputed from the present energy at each reading (cheap: O(N)), so it still applies after the piston or a thermostat changes the energy.

**Worker → client → props.** The worker builds a `ReactionMeter` next to the pressure meter when the run has reactions and posts `{ type: 'reactions', reading }` with the census (a few times a second). `SimulationClient` keeps `reactions` as `$state.raw`, plus `resetReactionAverage()` and the reaction rule editing. `loaded` says whether reactions run (`reactions: boolean`).

**SIM-29 / STAT-1.** When a load turns reactions on (not a continued edit), the client switches the plot to Number of Particles even if the user picked another; when they go off and the plot was Number of Particles, it goes back to Instantaneous Speed. `2Dequil` and `3Dequil` already name it as their plot.

**The Reactions panel** (`ReactionsPanel.svelte`, wrapped in `SidebarPanel`, shown while reactions run):

- A table of kinds: swatch, name, count now, time-averaged count ± width.
- Predicted equilibrium product count ± width, or why there's none.
- "Time to N {product}": a number field and the time it took (or "not yet").
- "Reset average".
- For the Java rule (the sidebar's switch), the energy diagram (SIM-27): a plain SVG, reactant level at 0, barrier at `E_f`, product level at `ΔE = E_f − E_r`, with the barrier and the product level draggable (pointer events, so touch works) and two number fields beside it, plus "Suppress reverse". Changes are applied with an Apply button, since each restarts the run. The forward/reverse fields move out of Arena options into this panel; the on/off switch stays.

## Tests

- `formulas.test.ts`: `reactionEquilibrium` gives 13.3 for `2Dequil` and 14.1 for `3Dequil` (PRED-14); the large-N limit matches `N₂/N₁ = exp(−ΔE / 2RT_final)` (PRED-13); parity and negative brackets.
- `reaction-meter.test.ts`: counts match a recount after many events; time average of a hand-built history; time-to-N; a seeded headless long run of `2Dequil` whose averaged product count comes within a couple of widths of the prediction; the same for chained A → B → C (counts only, no prediction).
- `scenario.test.ts`: `3Dequil` now resolves with the rule enabled.

## Docs and specs

- `_Web port:_` notes on SIM-27–29, PRED-12–14, STAT-1, and the roadmap's Phase 7 entry.
- `apps/web/src/docs`: a Reactions page (or section) describing the panel, the diagram and the prediction.

## Outcome

Done as designed. Notes from doing it:

- The formula gives 13.37 (2D) and 14.09 (3D) at 300 K. `3Dequil`'s file gives every particle 2183 m/s, about 382 K in 3D, so the app (like the Java loader) predicts 16.4 for it; `predictions.md` and the user docs say so.
- Seeded runs of 1.5 million events average within a few tenths of the prediction in both presets and take about a second each, so they run with the normal tests.
- A reload of a reaction run (Apply on the diagram) keeps Number of Particles unless the user picked another plot.
- The reacted copy the sidebar's switch adds takes the scenario's next kind's name (Type B for `.set` files) instead of "Reacted".
