<!-- The simulation viewer: the arena plus its sidebar of controls, readouts and charts.
     It fills its container, so the page decides how big it is. -->
<script lang="ts">
  import { Button } from '@boltzmann4d/ui/button';
  import * as Collapsible from '@boltzmann4d/ui/collapsible';
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
  import MaximizeIcon from '@lucide/svelte/icons/maximize';
  import MinimizeIcon from '@lucide/svelte/icons/minimize';
  import PanelRightCloseIcon from '@lucide/svelte/icons/panel-right-close';
  import PanelRightOpenIcon from '@lucide/svelte/icons/panel-right-open';
  import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
  import StepForwardIcon from '@lucide/svelte/icons/step-forward';
  import type { ScenarioInput } from '@boltzmann4d/engine/scenario';
  import { untrack } from 'svelte';
  import ArenaOptions from './ui/ArenaOptions.svelte';
  import PistonPanel from './ui/PistonPanel.svelte';
  import PlayPauseButton from './ui/PlayPauseButton.svelte';
  import RateSlider from './ui/RateSlider.svelte';
  import ScaleBar from './ui/ScaleBar.svelte';
  import ViewOptions from './ui/ViewOptions.svelte';
  import { missingBrowserFeatures } from './ui/browser-support';
  import { rotateView } from './ui/rotate-view';
  import { SimulationClient } from './ui/simulation.svelte';
  import type { ScenarioSource } from './worker';

  // LayerChart is most of the UI bundle, so the statistics panel loads after the arena.
  const statisticsPanel = import('./ui/StatisticsPanel.svelte');

  interface Props {
    /** Bundled preset to run (file name without `.set`). Changing it loads the new preset. */
    preset?: string;
    /**
     * A scenario to run instead of a preset, e.g. from a file the user opened; `name` labels
     * it in errors. Passing a different object loads it.
     */
    scenario?: { name: string; scenario: ScenarioInput };
  }

  let { preset = 'default', scenario }: Props = $props();

  const source = $derived<ScenarioSource>(
    scenario
      ? { kind: 'scenario', name: scenario.name, scenario: scenario.scenario }
      : { kind: 'preset', name: preset },
  );

  let canvas: HTMLCanvasElement;
  /** The whole viewer (arena and sidebar), which goes fullscreen. */
  let root: HTMLDivElement;
  // Presentation mode, for projectors: hide the sidebar, and/or fill the screen.
  let sidebarHidden = $state(false);
  let fullscreen = $state(false);
  /** Phones' Safari has no Fullscreen API for elements, so the button only shows where it works. */
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.requestFullscreen().catch(() => {});
  }
  let sim = $state<SimulationClient | null>(null);
  /** The performance readouts under the particle count (frame rates, physics time, renderer). */
  let detailsOpen = $state(true);
  /** Browser features the simulator needs but can't find (it doesn't start without them). */
  const missing = missingBrowserFeatures();

  $effect(() => {
    if (missing.length > 0) return;
    const client = new SimulationClient(
      canvas,
      untrack(() => source),
    );
    sim = client;
    return () => {
      sim = null;
      client.dispose();
    };
  });

  // Follow later changes to `preset` or `scenario` (load ignores the one already running).
  $effect(() => {
    const next = source;
    untrack(() => sim?.load(next));
  });
</script>

<svelte:document onfullscreenchange={() => (fullscreen = document.fullscreenElement === root)} />

<!-- Phones: the arena takes a fixed share of the top and the sidebar scrolls below it.
     Wider screens: the arena on the left, a 320px sidebar on the right.
     With the sidebar hidden, the arena takes all of it. -->
<div
  bind:this={root}
  class={[
    'bg-background grid h-full min-h-0 overflow-hidden',
    sidebarHidden
      ? 'grid-rows-1'
      : 'grid-rows-[min(55dvh,90vw)_1fr] md:grid-cols-[1fr_320px] md:grid-rows-1',
  ]}
>
  <div class="relative min-h-0 min-w-0">
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
      onclick={() => {
        // Maxwell's demon (2D): clicking the arena opens or closes the hole, as in Java.
        if (sim && sim.dimension !== 3 && sim.holeOpen !== null) sim.setHoleOpen(!sim.holeOpen);
      }}
    ></canvas>
    {#if sim && sim.dimension !== 3 && !sim.error}
      <ScaleBar arena={sim.arenaSize} canvas={sim.canvasSize} />
    {/if}
    <div class="absolute top-2 right-2 flex gap-1" role="group" aria-label="Presentation">
      {#if canFullscreen}
        <Button
          variant="ghost"
          size="icon"
          class="bg-background/60 backdrop-blur-sm"
          aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
          title={fullscreen ? 'Exit full screen' : 'Full screen'}
          onclick={toggleFullscreen}
        >
          {#if fullscreen}<MinimizeIcon aria-hidden="true" />{:else}<MaximizeIcon
              aria-hidden="true"
            />{/if}
        </Button>
      {/if}
      <Button
        variant="ghost"
        size="icon"
        class="bg-background/60 backdrop-blur-sm"
        aria-label={sidebarHidden ? 'Show controls' : 'Hide controls'}
        aria-pressed={sidebarHidden}
        title={sidebarHidden ? 'Show controls' : 'Hide controls'}
        onclick={() => (sidebarHidden = !sidebarHidden)}
      >
        {#if sidebarHidden}<PanelRightOpenIcon aria-hidden="true" />{:else}<PanelRightCloseIcon
            aria-hidden="true"
          />{/if}
      </Button>
    </div>
    {#if missing.length > 0 || sim?.error}
      <div class="bg-background/90 absolute inset-0 grid place-items-center p-4" role="alert">
        <div class="max-w-sm space-y-3 text-center">
          {#if missing.length > 0}
            <p class="font-semibold">This browser can’t run the simulation</p>
            <p class="text-muted-foreground text-sm">
              It needs {missing.join(' and ')}. Try a recent version of Chrome, Edge, Firefox or
              Safari, and check that hardware acceleration is turned on.
            </p>
          {:else}
            <p class="font-semibold">The simulation stopped</p>
            <p class="text-muted-foreground text-sm break-words">{sim?.error}</p>
            <Button variant="outline" onclick={() => location.reload()}>Reload</Button>
          {/if}
        </div>
      </div>
    {/if}
  </div>
  <aside
    hidden={sidebarHidden}
    class="bg-muted/40 min-h-0 overflow-y-auto overscroll-contain border-t p-4 md:border-t-0 md:border-l"
  >
    {#if sim}
      <ViewOptions
        colorMode={sim.colorMode}
        trace={sim.trace.enabled}
        canTrace={sim.dimension !== 3}
        onColorMode={(mode) => sim?.setColorMode(mode)}
        onTrace={(enabled) => sim?.setTrace(enabled)}
      />
    {/if}
    {#if sim?.arena}
      <ArenaOptions
        arena={sim.arena}
        disabled={sim.loading}
        onChange={(options) => sim?.setArenaOptions(options)}
      />
    {/if}
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
      <!-- Restart (Physics.reset): the same starting positions and velocities again. -->
      <Button
        variant="outline"
        size="icon-lg"
        disabled={!sim || sim.loading}
        aria-label="Restart"
        title="Restart from the starting state"
        onclick={() => sim?.restart()}
      >
        <RotateCcwIcon aria-hidden="true" />
      </Button>
      {#if sim?.holeOpen !== null && sim?.holeOpen !== undefined}
        <Button
          variant="outline"
          size="lg"
          aria-pressed={sim.holeOpen}
          onclick={() => sim?.setHoleOpen(!sim.holeOpen)}
        >
          {sim.holeOpen ? 'Close hole' : 'Open hole'}
        </Button>
      {/if}
    </div>
    <RateSlider
      value={sim?.rateScale ?? 1}
      disabled={!sim}
      onChange={(scale) => sim?.setRateScale(scale)}
    />
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
    <!-- Diagnostics last: particle count, frame rates and where drawing happens. -->
    {#if sim && !sim.error}
      <Collapsible.Root bind:open={detailsOpen} class="mt-4 border-t pt-2">
        <Collapsible.Trigger
          class="text-muted-foreground hover:text-foreground -mx-1 flex min-h-8 w-[calc(100%+0.5rem)] items-center justify-between rounded-md px-1 text-xs font-medium"
        >
          {sim.loading
            ? 'Loading…'
            : `${sim.particleCount} particles, ${sim.simulationFps.toFixed(0)} fps`}
          <ChevronDownIcon
            class={['size-4 transition-transform', detailsOpen && 'rotate-180']}
            aria-hidden="true"
          />
        </Collapsible.Trigger>
        <Collapsible.Content class="text-muted-foreground space-y-1 text-xs tabular-nums">
          <p>
            {sim.drawnFps.toFixed(0)} frames drawn per second · physics {sim.physicsMs.toFixed(2)} ms/frame
          </p>
          <p>{sim.simulatedPsPerSecond.toFixed(1)} ps simulated per second</p>
          <p>Rendering on the {sim.renderThread === 'worker' ? 'render worker' : 'main thread'}</p>
        </Collapsible.Content>
      </Collapsible.Root>
    {/if}
  </aside>
</div>
