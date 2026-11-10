<script lang="ts">
  import ArenaOptions from './ArenaOptions.svelte';
  import PistonPanel from './PistonPanel.svelte';
  import PlayPauseButton from './PlayPauseButton.svelte';
  import PresetPicker from './PresetPicker.svelte';
  import RateSlider from './RateSlider.svelte';
  import { rotateView } from './rotate-view';
  import { SimulationClient } from './simulation.svelte';

  // LayerChart is most of the UI bundle, so the statistics panel loads after the arena.
  const statisticsPanel = import('./StatisticsPanel.svelte');

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
  <canvas
    bind:this={canvas}
    class:rotatable={sim?.dimension === 3}
    use:rotateView={sim?.dimension === 3 ? (x, y) => sim?.rotate(x, y) : null}
    tabindex={sim?.dimension === 3 ? 0 : -1}
    aria-label={sim?.dimension === 3
      ? 'Simulation arena; drag or use the arrow keys to turn it'
      : 'Simulation arena'}
  ></canvas>
  <aside>
    <h1>Boltzmann 4D</h1>
    <PresetPicker
      value={sim?.preset ?? 'default'}
      disabled={!sim || sim.loading}
      onChange={(name) => sim?.loadPreset(name)}
    />
    {#if sim?.arena}
      <ArenaOptions
        arena={sim.arena}
        disabled={sim.loading}
        onChange={(options) => sim?.setArenaOptions(options)}
      />
    {/if}
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
    <RateSlider
      value={sim?.rateScale ?? 1}
      disabled={!sim}
      onChange={(scale) => sim?.setRateScale(scale)}
    />
    {#if sim?.error}
      <p class="error" role="alert">{sim.error}</p>
    {:else if sim}
      <p class="readout">
        {sim.loading ? 'Loading…' : `${sim.particleCount} particles`}
      </p>
      <p class="readout">
        {sim.simulationFps.toFixed(0)} fps ({sim.drawnFps.toFixed(0)} drawn) · physics {sim.physicsMs.toFixed(
          2,
        )} ms/frame
      </p>
      <p class="readout">{sim.simulatedPsPerSecond.toFixed(1)} ps simulated per second</p>
      <p class="readout">
        Rendering on the {sim.renderThread === 'worker' ? 'render worker' : 'main thread'}
      </p>
    {/if}
    {#if sim?.piston}
      <PistonPanel
        piston={sim.piston}
        onMove={(level, mode, speed) => sim?.movePiston(level, mode, speed)}
        onStop={() => sim?.stopPiston()}
      />
    {/if}
    {#if sim?.statistics}
      {#await statisticsPanel then { default: StatisticsPanel }}
        <StatisticsPanel summary={sim.statistics} />
      {/await}
    {/if}
  </aside>
</main>

<style>
  /* The page never scrolls: the arena stays put and the sidebar scrolls on its own. */
  main {
    display: grid;
    grid-template-columns: 1fr 320px;
    height: 100dvh;
    overflow: hidden;
  }
  canvas {
    width: 100%;
    height: 100%;
    display: block;
    min-width: 0;
    min-height: 0;
  }
  /* 3D: drags turn the view, so touches mustn't scroll or zoom the page. */
  canvas.rotatable {
    touch-action: none;
    cursor: grab;
  }
  canvas.rotatable:active {
    cursor: grabbing;
  }
  aside {
    background: var(--panel-bg);
    border-left: 1px solid var(--panel-border);
    padding: 1rem;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
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
    /* Phones: the arena takes a fixed share of the top of the screen and the sidebar
       scrolls in the space below it. */
    main {
      grid-template-columns: 1fr;
      grid-template-rows: min(55dvh, 90vw) 1fr;
    }
    aside {
      border-left: none;
      border-top: 1px solid var(--panel-border);
    }
  }
</style>
