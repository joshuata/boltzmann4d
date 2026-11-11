<!-- Arena options a preset can take without moving its particles: the movable piston for a
     reflecting arena, a conducting divider for a divided one, and attractive square wells
     between particles in any non-periodic arena (the Java app's Energy Wells tab).
     Changing one restarts the simulation. -->
<script lang="ts">
  import SidebarPanel from './SidebarPanel.svelte';
  import type { ArenaInfo, ArenaOptions } from '../worker';

  interface Props {
    arena: ArenaInfo;
    disabled?: boolean;
    onChange: (options: ArenaOptions) => void;
  }

  let { arena, disabled = false, onChange }: Props = $props();

  // Java's defaults: radius 3 × contact distance, 1 kJ/mol per species.
  const DEFAULT_MULTIPLIER = 3.0;
  const DEFAULT_DEPTH = 1.0;
  let multiplier = $state(DEFAULT_MULTIPLIER);
  let depths = $state<number[]>([]);
  $effect.pre(() => {
    // Start from what's running (or the defaults) whenever a preset loads.
    multiplier = arena.options.wells?.radiusMultiplier ?? DEFAULT_MULTIPLIER;
    depths = arena.typeNames.map((_, t) => arena.options.wells?.depths[t] ?? DEFAULT_DEPTH);
  });
  const wellsOn = $derived(Boolean(arena.options.wells));
  const valid = $derived(multiplier > 1 && depths.every((d) => Number.isFinite(d) && d >= 0));
  const changed = $derived(
    !arena.options.wells ||
      arena.options.wells.radiusMultiplier !== multiplier ||
      arena.options.wells.depths.some((d, t) => d !== depths[t]),
  );
  // The attractive wall: Java's defaults, 10 nm wide and 2.5 kJ/mol deep.
  let wallWidth = $state(10);
  let wallDepth = $state(2.5);
  $effect.pre(() => {
    wallWidth = (arena.options.attractiveWall?.width ?? 10e-9) * 1e9;
    wallDepth = arena.options.attractiveWall?.depth ?? 2.5;
  });
  const wallOn = $derived(Boolean(arena.options.attractiveWall));
  const wallValid = $derived(wallWidth > 0 && wallDepth >= 0);
  const wallChanged = $derived(
    !arena.options.attractiveWall ||
      arena.options.attractiveWall.width !== wallWidth * 1e-9 ||
      arena.options.attractiveWall.depth !== wallDepth,
  );
  const applyWall = () =>
    onChange({ attractiveWall: { width: wallWidth * 1e-9, depth: wallDepth } });
  // Reactions: Java's defaults, forward 8 and reverse 4 kJ/mol.
  let forward = $state(8);
  let reverse = $state(4);
  let suppressReverse = $state(false);
  $effect.pre(() => {
    forward = arena.options.reactions?.forward ?? 8;
    reverse = arena.options.reactions?.reverse ?? 4;
    suppressReverse = arena.options.reactions?.suppressReverse ?? false;
  });
  const reactionsOn = $derived(Boolean(arena.options.reactions));
  const reactionsValid = $derived(forward >= 0 && reverse >= 0);
  const reactionsChanged = $derived(
    !arena.options.reactions ||
      arena.options.reactions.forward !== forward ||
      arena.options.reactions.reverse !== reverse ||
      arena.options.reactions.suppressReverse !== suppressReverse,
  );
  const applyReactions = () => onChange({ reactions: { forward, reverse, suppressReverse } });
  const applyWells = () =>
    onChange({ wells: { radiusMultiplier: multiplier, depths: [...depths] } });
</script>

{#if arena.canHavePiston || arena.canConduct || arena.canDemon || arena.canHaveWells || arena.canReact}
  <SidebarPanel id="arena" title="Arena">
    <div class="options">
      {#if arena.canHavePiston}
        <label>
          <input
            type="checkbox"
            checked={arena.options.piston ?? false}
            {disabled}
            onchange={(e) => onChange({ piston: e.currentTarget.checked })}
          />
          Movable piston
        </label>
      {/if}
      {#if arena.canConduct}
        <label>
          <input
            type="checkbox"
            checked={arena.options.conductingDivider ?? false}
            {disabled}
            onchange={(e) => onChange({ conductingDivider: e.currentTarget.checked })}
          />
          Divider conducts heat
        </label>
      {/if}
      {#if arena.canDemon}
        <label>
          <input
            type="checkbox"
            checked={arena.options.demon ?? false}
            {disabled}
            onchange={(e) => onChange({ demon: e.currentTarget.checked })}
          />
          Maxwell's demon (you open the hole)
        </label>
      {/if}
      {#if arena.canHaveWells}
        <label>
          <input
            type="checkbox"
            checked={wellsOn}
            {disabled}
            onchange={(e) => (e.currentTarget.checked ? applyWells() : onChange({ wells: null }))}
          />
          Attractive wells
        </label>
        {#if wellsOn}
          <div class="wells">
            <label class="field">
              <span>Radius (× contact)</span>
              <input
                type="number"
                min="1.05"
                max="10"
                step="0.1"
                bind:value={multiplier}
                {disabled}
              />
            </label>
            {#each arena.typeNames as name, t (t)}
              <label class="field">
                <span>{name} depth (kJ/mol)</span>
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="0.5"
                  bind:value={depths[t]}
                  {disabled}
                />
              </label>
            {/each}
            <button type="button" disabled={disabled || !valid || !changed} onclick={applyWells}>
              Apply
            </button>
          </div>
        {/if}
        <label>
          <input
            type="checkbox"
            checked={wallOn}
            {disabled}
            onchange={(e) =>
              e.currentTarget.checked ? applyWall() : onChange({ attractiveWall: null })}
          />
          Attractive bottom wall
        </label>
        {#if wallOn}
          <div class="wells">
            <label class="field">
              <span>Width (nm)</span>
              <input
                type="number"
                min="0.5"
                max="100"
                step="0.5"
                bind:value={wallWidth}
                {disabled}
              />
            </label>
            <label class="field">
              <span>Depth (kJ/mol)</span>
              <input type="number" min="0" max="50" step="0.5" bind:value={wallDepth} {disabled} />
            </label>
            <button
              type="button"
              disabled={disabled || !wallValid || !wallChanged}
              onclick={applyWall}
            >
              Apply
            </button>
          </div>
        {/if}
      {/if}
      {#if arena.canReact}
        <label>
          <input
            type="checkbox"
            checked={reactionsOn}
            {disabled}
            onchange={(e) =>
              e.currentTarget.checked ? applyReactions() : onChange({ reactions: null })}
          />
          Reactions (red ⇌ blue)
        </label>
        {#if reactionsOn}
          <div class="wells">
            <label class="field">
              <span>Forward (kJ/mol)</span>
              <input type="number" min="0" max="50" step="0.5" bind:value={forward} {disabled} />
            </label>
            <label class="field">
              <span>Reverse (kJ/mol)</span>
              <input type="number" min="0" max="50" step="0.5" bind:value={reverse} {disabled} />
            </label>
            <label class="inline">
              <input type="checkbox" bind:checked={suppressReverse} {disabled} />
              No reverse
            </label>
            <button
              type="button"
              disabled={disabled || !reactionsValid || !reactionsChanged}
              onclick={applyReactions}
            >
              Apply
            </button>
          </div>
        {/if}
      {/if}
    </div>
  </SidebarPanel>
{/if}

<style>
  .options {
    display: grid;
    gap: 0.4rem;
    font-size: 0.85rem;
  }
  label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 1.75rem; /* comfortable touch target */
  }
  input[type='checkbox'] {
    width: 1.1rem;
    height: 1.1rem;
    margin: 0;
  }
  .wells {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
    gap: 0.5rem;
    padding-left: 1.6rem;
  }
  .field {
    display: grid;
    gap: 0.2rem;
    align-items: stretch;
    min-width: 0;
  }
  .field input,
  .wells button {
    font: inherit;
    padding: 0.3rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: var(--background);
    color: inherit;
    min-width: 0;
    min-height: 2.25rem;
  }
  .wells button {
    align-self: end;
  }
  .inline {
    align-self: end;
    min-height: 2.25rem;
  }
  .wells button:disabled {
    opacity: 0.5;
  }
  :is(.field input, .wells button):focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
</style>
