<!-- The View menu: colour particles by type, speed or kinetic energy, kinds' markers and
     trace mode. -->
<script lang="ts">
  import type { ColorMode } from '@boltzmann4d/engine/sim';

  interface Props {
    colorMode: ColorMode;
    trace: boolean;
    /** Trace mode is 2D-only so far. */
    canTrace: boolean;
    /** Kinds' markers on particles (KIND-9; 2D). */
    markers: boolean;
    canMark: boolean;
    onColorMode: (mode: ColorMode) => void;
    onTrace: (enabled: boolean) => void;
    onMarkers: (enabled: boolean) => void;
  }

  let { colorMode, trace, canTrace, markers, canMark, onColorMode, onTrace, onMarkers }: Props =
    $props();

  const MODES: { value: ColorMode; label: string }[] = [
    { value: 'NORMAL', label: 'By type' },
    { value: 'SPEED', label: 'By speed' },
    { value: 'KE', label: 'By kinetic energy' },
  ];
</script>

<fieldset class="view">
  <legend>View</legend>
  <label class="field">
    <span>Colour</span>
    <select
      value={colorMode}
      onchange={(e) => onColorMode((e.currentTarget as HTMLSelectElement).value as ColorMode)}
    >
      {#each MODES as m (m.value)}
        <option value={m.value}>{m.label}</option>
      {/each}
    </select>
  </label>
  {#if colorMode !== 'NORMAL'}
    <p class="hint">Violet is slow, red is fast (2.5 × the predicted average or more).</p>
  {/if}
  {#if canMark}
    <label class="check">
      <input
        type="checkbox"
        checked={markers}
        onchange={(e) => onMarkers(e.currentTarget.checked)}
      />
      Kind markers
    </label>
  {/if}
  {#if canTrace}
    <label class="check">
      <input type="checkbox" checked={trace} onchange={(e) => onTrace(e.currentTarget.checked)} />
      Trace paths
    </label>
  {/if}
</fieldset>

<style>
  .view {
    display: grid;
    gap: 0.4rem;
    margin: 0 0 0.75rem;
    padding: 0.5rem 0.75rem 0.65rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    font-size: 0.85rem;
    min-width: 0;
  }
  legend {
    padding: 0 0.25rem;
  }
  .field {
    display: grid;
    gap: 0.25rem;
  }
  select {
    font: inherit;
    padding: 0.35rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: var(--background);
    color: inherit;
    min-height: 2.25rem;
  }
  select:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 1.75rem;
  }
  .check input {
    width: 1.1rem;
    height: 1.1rem;
    margin: 0;
  }
  .hint {
    margin: 0;
    font-size: 0.8rem;
    opacity: 0.75;
  }
</style>
