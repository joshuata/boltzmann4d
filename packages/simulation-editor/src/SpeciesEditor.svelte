<!-- One colour's particles: whether there are any, and their count, mass, radius and
     temperature (PART-1–5). -->
<script lang="ts">
  import { Checkbox } from '@boltzmann4d/ui/checkbox';
  import type { FieldErrors, SpeciesFields } from './form';
  import NumberField from './NumberField.svelte';

  interface Props {
    color: 'red' | 'blue';
    species: SpeciesFields;
    errors: FieldErrors;
    /** False once the arena changed: the scenario's positions no longer apply. */
    keepsPositions: boolean;
  }

  let { color, species = $bindable(), errors, keepsPositions }: Props = $props();

  const title = $derived(color === 'red' ? 'Red particles' : 'Blue particles');
</script>

<fieldset class="space-y-3 rounded-lg border p-3">
  <legend class="flex items-center gap-2 px-1 text-sm font-semibold">
    <span
      class={['size-3 rounded-full', color === 'red' ? 'bg-red-500' : 'bg-blue-500']}
      aria-hidden="true"
    ></span>
    {title}
  </legend>
  <div class="flex min-h-8 items-center gap-2">
    <Checkbox id="{color}-enabled" bind:checked={species.enabled} />
    <label for="{color}-enabled" class="text-sm">Include {color} particles</label>
  </div>
  {#if species.enabled}
    <div class="grid grid-cols-2 gap-3">
      <NumberField
        id="{color}-count"
        label="Number"
        bind:value={species.count}
        step={1}
        min={1}
        max={999}
        error={errors[`${color}.count`]}
      />
      <NumberField
        id="{color}-temperature"
        label="Temperature"
        unit="K"
        bind:value={species.temperature}
        min={0}
        error={errors[`${color}.temperature`]}
      />
      <NumberField
        id="{color}-mass"
        label="Mass"
        unit="amu"
        bind:value={species.mass}
        min={0}
        error={errors[`${color}.mass`]}
      />
      <NumberField
        id="{color}-radius"
        label="Radius"
        unit="nm"
        bind:value={species.radius}
        min={0.2}
        max={20}
        error={errors[`${color}.radius`]}
      />
    </div>
    {#if species.placed > 0 && keepsPositions}
      <p class="text-muted-foreground text-xs">
        {Math.min(species.placed, species.count)} of these start where the scenario puts them;
        {species.count > species.placed ? 'the rest are placed at random.' : 'none at random.'}
      </p>
    {/if}
  {/if}
</fieldset>
