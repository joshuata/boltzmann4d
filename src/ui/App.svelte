<script lang="ts">
  import { createRenderer } from '../render';
  import PlayPauseButton from './PlayPauseButton.svelte';
  import { SimulationClient } from './simulation.svelte';

  let canvas: HTMLCanvasElement;
  let sim = $state<SimulationClient | null>(null);

  $effect(() => {
    const renderer = createRenderer(canvas);
    const client = new SimulationClient({
      onScene: (scene) => renderer.setScene(scene),
      onFrame: (frame) => renderer.setNextFrameToDisplay(frame),
    });
    sim = client;
    return () => {
      sim = null;
      client.dispose();
      renderer.dispose();
    };
  });
</script>

<main>
  <canvas bind:this={canvas}></canvas>
  <aside>
    <h1>Boltzmann 4D</h1>
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
      <p class="readout">Physics: {sim.physicsMs.toFixed(2)} ms/frame</p>
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
