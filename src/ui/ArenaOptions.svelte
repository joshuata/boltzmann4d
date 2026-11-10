<!-- Arena options a preset can take without moving its particles: the movable piston for a
     reflecting arena, and a conducting divider for a divided one. Changing one restarts
     the simulation. -->
<script lang="ts">
  import type { ArenaInfo, ArenaOptions } from '../worker';

  interface Props {
    arena: ArenaInfo;
    disabled?: boolean;
    onChange: (options: ArenaOptions) => void;
  }

  let { arena, disabled = false, onChange }: Props = $props();
</script>

{#if arena.canHavePiston || arena.canConduct}
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
  input {
    width: 1.1rem;
    height: 1.1rem;
    margin: 0;
  }
</style>
