<!-- The piston controls (the Java app's Piston Control Panel): a target position, how the
     piston moves there, its speed, and Move / Stop. Positions are shown as how far the
     piston is pushed in. -->
<script lang="ts">
  import SidebarPanel from './SidebarPanel.svelte';
  import { PistonMode } from '@boltzmann4d/engine/sim/piston';
  import type { PistonInfo } from '../worker';

  interface Props {
    piston: PistonInfo & { level: number; moving: boolean };
    onMove: (level: number, mode: PistonMode, speed: number) => void;
    onStop: () => void;
  }

  let { piston, onMove, onStop }: Props = $props();

  const MODES: { value: PistonMode; label: string }[] = [
    { value: PistonMode.ADIABATIC, label: 'Adiabatic' },
    { value: PistonMode.ISOTHERMAL, label: 'Isothermal' },
    { value: PistonMode.INSTANTANEOUS, label: 'Instantaneous' },
  ];

  /** Slider steps of 0.1% of the arena height, as in Java (0–1000). */
  const STEPS = 1000;
  let target = $state(0);
  let mode = $state<PistonMode>(PistonMode.ADIABATIC);
  /** nm/ps (= 1000 m/s), as in Java's speed spinner. */
  let speed = $state(0.2);

  const maxStep = $derived(Math.floor(piston.maxLevel * STEPS));
  const nm = (level: number) => (level * piston.arenaHeight * 1e9).toFixed(2);
  // Java only allows instantaneous moves outwards.
  const instantInwards = $derived(
    mode === PistonMode.INSTANTANEOUS && target / STEPS > piston.level,
  );
  const speedValid = $derived(Number.isFinite(speed) && speed > 0);
</script>

<SidebarPanel id="piston" title="Piston">
  <div class="piston">
    <p class="readout">
      Pushed in {nm(piston.level)} nm ({(piston.level * 100).toFixed(1)}%){piston.moving
        ? ' · moving'
        : ''}
    </p>

    <label class="field">
      <span>Target: {nm(target / STEPS)} nm ({(target / 10).toFixed(1)}%)</span>
      <input type="range" min="0" max={maxStep} step="1" bind:value={target} />
    </label>

    <div class="row">
      <label class="field">
        <span>Mode</span>
        <select bind:value={mode}>
          {#each MODES as m (m.value)}
            <option value={m.value}>{m.label}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span>Speed (nm/ps)</span>
        <input
          type="number"
          min="0.01"
          max="10"
          step="0.05"
          bind:value={speed}
          disabled={mode === PistonMode.INSTANTANEOUS}
        />
      </label>
    </div>

    {#if instantInwards}
      <p class="hint">An instantaneous move can only pull the piston out.</p>
    {/if}

    <div class="row buttons">
      <button
        type="button"
        disabled={instantInwards || !speedValid}
        onclick={() => onMove(target / STEPS, mode, speed * 1000)}
      >
        Move
      </button>
      <button type="button" disabled={!piston.moving} onclick={onStop}>Stop</button>
    </div>
  </div>
</SidebarPanel>

<style>
  .piston {
    display: grid;
    gap: 0.5rem;
    font-size: 0.85rem;
    min-width: 0;
  }
  .readout {
    margin: 0;
    font-variant-numeric: tabular-nums;
    opacity: 0.8;
  }
  .field {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
    font-variant-numeric: tabular-nums;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  input[type='range'] {
    width: 100%;
    min-height: 1.75rem; /* comfortable touch target */
  }
  select,
  input[type='number'],
  button {
    font: inherit;
    padding: 0.35rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: var(--background);
    color: inherit;
    min-width: 0;
    min-height: 2.25rem;
  }
  button:not(:disabled):hover {
    background: var(--accent);
  }
  button:disabled {
    opacity: 0.5;
  }
  :is(select, input, button):focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .hint {
    margin: 0;
    font-size: 0.8rem;
    opacity: 0.75;
  }
</style>
