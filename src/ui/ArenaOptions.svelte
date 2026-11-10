<!-- Arena options a preset can take without moving its particles: the movable piston for a
     reflecting arena, a conducting divider for a divided one, and attractive square wells
     between particles in any non-periodic arena (the Java app's Energy Wells tab).
     Changing one restarts the simulation. -->
<script lang="ts">
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
  const applyWells = () =>
    onChange({ wells: { radiusMultiplier: multiplier, depths: [...depths] } });
</script>

{#if arena.canHavePiston || arena.canConduct || arena.canHaveWells}
  <fieldset class="options">
    <legend>Arena</legend>
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
              <input type="number" min="0" max="50" step="0.5" bind:value={depths[t]} {disabled} />
            </label>
          {/each}
          <button type="button" disabled={disabled || !valid || !changed} onclick={applyWells}>
            Apply
          </button>
        </div>
      {/if}
    {/if}
  </fieldset>
{/if}

<style>
  .options {
    display: grid;
    gap: 0.4rem;
    margin: 0 0 0.75rem;
    padding: 0.5rem 0.75rem 0.65rem;
    border: 1px solid var(--panel-border);
    border-radius: 0.375rem;
    font-size: 0.85rem;
  }
  legend {
    padding: 0 0.25rem;
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
    border: 1px solid var(--panel-border);
    border-radius: 0.375rem;
    background: var(--button-bg);
    color: inherit;
    min-width: 0;
    min-height: 2.25rem;
  }
  .wells button {
    align-self: end;
  }
  .wells button:disabled {
    opacity: 0.5;
  }
  :is(.field input, .wells button):focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
</style>
