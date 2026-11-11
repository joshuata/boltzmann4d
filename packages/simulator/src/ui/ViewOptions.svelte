<!-- The View menu: colour particles by type, speed or kinetic energy, kinds' markers and
     trace mode (VIEW-5) with its Clear action. -->
<script lang="ts">
  import SidebarPanel from './SidebarPanel.svelte';
  import { Button } from '@boltzmann4d/ui/button';
  import type { ColorMode } from '@boltzmann4d/engine/sim';

  interface Props {
    colorMode: ColorMode;
    trace: boolean;
    /** Kinds' markers on particles (KIND-9; 2D). */
    markers: boolean;
    canMark: boolean;
    onColorMode: (mode: ColorMode) => void;
    onTrace: (enabled: boolean) => void;
    /** Erases the trace drawn so far. */
    onClearTrace: () => void;
    onMarkers: (enabled: boolean) => void;
  }

  let { colorMode, trace, markers, canMark, onColorMode, onTrace, onClearTrace, onMarkers }: Props =
    $props();

  const MODES: { value: ColorMode; label: string }[] = [
    { value: 'NORMAL', label: 'By type' },
    { value: 'SPEED', label: 'By speed' },
    { value: 'KE', label: 'By kinetic energy' },
  ];
</script>

<SidebarPanel id="view" title="View">
  <div class="view">
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
      <p class="hint">
        Violet to red across the {colorMode === 'KE' ? 'Kinetic energy' : 'Instantaneous speed'} plot’s
        min and max; darker beyond them.
      </p>
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
    <div class="flex items-center justify-between gap-2">
      <label class="check">
        <input type="checkbox" checked={trace} onchange={(e) => onTrace(e.currentTarget.checked)} />
        Trace paths
      </label>
      {#if trace}
        <Button variant="outline" size="sm" onclick={onClearTrace}>Clear trace</Button>
      {/if}
    </div>
  </div>
</SidebarPanel>

<style>
  .view {
    display: grid;
    gap: 0.4rem;
    font-size: 0.85rem;
    min-width: 0;
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
