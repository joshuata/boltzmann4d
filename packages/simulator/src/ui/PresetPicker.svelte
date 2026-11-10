<!-- Chooses one of the bundled presets (the Java app's Presets menu). -->
<script lang="ts">
  import { presetCatalog } from '@boltzmann4d/engine/io/presets';

  interface Props {
    value: string;
    disabled?: boolean;
    onChange: (name: string) => void;
  }

  let { value, disabled = false, onChange }: Props = $props();

  const twoD = presetCatalog.filter((p) => p.dimensions === 2);
  const threeD = presetCatalog.filter((p) => p.dimensions === 3);
</script>

<label class="picker">
  <span>Preset</span>
  <select
    {value}
    {disabled}
    onchange={(event) => onChange((event.currentTarget as HTMLSelectElement).value)}
  >
    <optgroup label="2D">
      {#each twoD as preset (preset.name)}
        <option value={preset.name}>{preset.label}</option>
      {/each}
    </optgroup>
    <optgroup label="3D">
      {#each threeD as preset (preset.name)}
        <option value={preset.name}>{preset.label}</option>
      {/each}
    </optgroup>
  </select>
</label>

<style>
  .picker {
    display: grid;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
    font-size: 0.85rem;
  }
  select {
    font: inherit;
    padding: 0.35rem 0.4rem;
    border: 1px solid var(--panel-border);
    border-radius: 0.375rem;
    background: var(--button-bg);
    color: inherit;
  }
  select:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
</style>
