<script lang="ts">
  import PlayPauseButton from './PlayPauseButton.svelte';
  import PresetPicker from './PresetPicker.svelte';
  import { SimulationClient } from './simulation.svelte';

  let canvas: HTMLCanvasElement;
  let sim = $state<SimulationClient | null>(null);

  $effect(() => {
    const client = new SimulationClient(canvas);
    sim = client;
    return () => {
      sim = null;
      client.dispose();
    };
  });
</script>

<main>
  <canvas bind:this={canvas}></canvas>
  <aside>
    <h1>Boltzmann 4D</h1>
    <PresetPicker
      value={sim?.preset ?? 'default'}
      disabled={!sim || sim.loading}
      onChange={(name) => sim?.loadPreset(name)}
    />
    <div class="transport" role="group" aria-label="Simulation controls">
      <PlayPauseButton
        paused={sim?.paused ?? false}
        disabled={!sim}
        onToggle={(paused) => sim?.setPaused(paused)}
      />
      <!-- btnFrameStep in MainGuiFullView: enabled only while paused. -->
      <button
        type="button"
        class="icon-button"
        disabled={!sim?.paused}
        aria-label="Step one frame"
        title="Step one frame"
        onclick={() => sim?.advanceOneFrame()}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 4.5v15l11-7.5zM16.5 4.5h3v15h-3z" />
        </svg>
      </button>
    </div>
    {#if sim?.error}
      <p class="error" role="alert">Simulation failed to start: {sim.error}</p>
    {:else if sim}
      <p class="readout">
        {sim.loading ? 'Loading…' : `${sim.particleCount} particles`}
      </p>
      <p class="readout">
        {sim.simulationFps.toFixed(0)} fps ({sim.drawnFps.toFixed(0)} drawn) · physics {sim.physicsMs.toFixed(
          2,
        )} ms/frame
      </p>
      <p class="readout">
        Rendering on the {sim.renderThread === 'worker' ? 'render worker' : 'main thread'}
      </p>
    {/if}
  </aside>
</main>

<style>
  main {
    display: grid;
    grid-template-columns: 1fr 320px;
    height: 100%;
  }
  canvas {
    width: 100%;
    height: 100%;
    display: block;
    min-width: 0;
  }
  aside {
    background: var(--panel-bg);
    border-left: 1px solid var(--panel-border);
    padding: 1rem;
  }
  h1 {
    font-size: 1.25rem;
    margin: 0 0 0.75rem;
  }
  .readout {
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
  }
  .error {
    color: #dc2626;
  }
  .transport {
    display: flex;
    gap: 0.5rem;
  }
  @media (max-width: 700px) {
    main {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr auto;
    }
    aside {
      border-left: none;
      border-top: 1px solid var(--panel-border);
    }
  }
</style>
