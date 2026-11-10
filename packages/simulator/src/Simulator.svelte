<!-- The simulation viewer: the arena plus its sidebar of controls, readouts and charts.
     It fills its container, so the page decides how big it is. -->
<script lang="ts">
  import { Button } from '@boltzmann4d/ui/button';
  import StepForwardIcon from '@lucide/svelte/icons/step-forward';
  import { untrack } from 'svelte';
  import PlayPauseButton from './ui/PlayPauseButton.svelte';
  import RateSlider from './ui/RateSlider.svelte';
  import { rotateView } from './ui/rotate-view';
  import { SimulationClient } from './ui/simulation.svelte';

  // LayerChart is most of the UI bundle, so the statistics panel loads after the arena.
  const statisticsPanel = import('./ui/StatisticsPanel.svelte');

  interface Props {
    /** Bundled preset to run (file name without `.set`). Changing it loads the new preset. */
    preset?: string;
  }

  let { preset = 'default' }: Props = $props();

  let canvas: HTMLCanvasElement;
  let sim = $state<SimulationClient | null>(null);

  $effect(() => {
    const client = new SimulationClient(
      canvas,
      untrack(() => preset),
    );
    sim = client;
    return () => {
      sim = null;
      client.dispose();
    };
  });

  // Follow later changes to `preset` (loadPreset ignores the one already running).
  $effect(() => {
    const name = preset;
    untrack(() => sim?.loadPreset(name));
  });
</script>

<!-- Phones: the arena takes a fixed share of the top and the sidebar scrolls below it.
     Wider screens: the arena on the left, a 320px sidebar on the right. -->
<div
  class="grid h-full min-h-0 grid-rows-[min(55dvh,90vw)_1fr] overflow-hidden md:grid-cols-[1fr_320px] md:grid-rows-1"
>
  <canvas
    bind:this={canvas}
    class={[
      'block size-full min-h-0 min-w-0',
      sim?.dimension === 3 && 'cursor-grab touch-none active:cursor-grabbing',
    ]}
    use:rotateView={sim?.dimension === 3 ? (x, y) => sim?.rotate(x, y) : null}
    tabindex={sim?.dimension === 3 ? 0 : -1}
    aria-label={sim?.dimension === 3
      ? 'Simulation arena; drag or use the arrow keys to turn it'
      : 'Simulation arena'}
  ></canvas>
  <aside
    class="bg-muted/40 min-h-0 overflow-y-auto overscroll-contain border-t p-4 md:border-t-0 md:border-l"
  >
    <div class="flex gap-2" role="group" aria-label="Simulation controls">
      <PlayPauseButton
        paused={sim?.paused ?? false}
        disabled={!sim}
        onToggle={(paused) => sim?.setPaused(paused)}
      />
      <!-- btnFrameStep in MainGuiFullView: enabled only while paused. -->
      <Button
        variant="outline"
        size="icon-lg"
        disabled={!sim?.paused}
        aria-label="Step one frame"
        title="Step one frame"
        onclick={() => sim?.advanceOneFrame()}
      >
        <StepForwardIcon aria-hidden="true" />
      </Button>
    </div>
    <RateSlider
      value={sim?.rateScale ?? 1}
      disabled={!sim}
      onChange={(scale) => sim?.setRateScale(scale)}
    />
    {#if sim?.error}
      <p class="text-destructive text-sm" role="alert">Simulation failed to start: {sim.error}</p>
    {:else if sim}
      <div class="text-muted-foreground space-y-1 text-xs tabular-nums">
        <p>{sim.loading ? 'Loading…' : `${sim.particleCount} particles`}</p>
        <p>
          {sim.simulationFps.toFixed(0)} fps ({sim.drawnFps.toFixed(0)} drawn) · physics {sim.physicsMs.toFixed(
            2,
          )} ms/frame
        </p>
        <p>{sim.simulatedPsPerSecond.toFixed(1)} ps simulated per second</p>
        <p>Rendering on the {sim.renderThread === 'worker' ? 'render worker' : 'main thread'}</p>
      </div>
    {/if}
    {#if sim?.statistics}
      {#await statisticsPanel then { default: StatisticsPanel }}
        <StatisticsPanel summary={sim.statistics} />
      {/await}
    {/if}
  </aside>
</div>
