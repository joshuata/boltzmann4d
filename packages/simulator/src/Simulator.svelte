<!-- The simulation viewer: the arena plus its sidebar of controls, readouts and charts.
     It fills its container, so the page decides how big it is. -->
<script lang="ts">
  import { Button } from '@boltzmann4d/ui/button';
  import MaximizeIcon from '@lucide/svelte/icons/maximize';
  import MinimizeIcon from '@lucide/svelte/icons/minimize';
  import PanelRightCloseIcon from '@lucide/svelte/icons/panel-right-close';
  import PanelRightOpenIcon from '@lucide/svelte/icons/panel-right-open';
  import RewindIcon from '@lucide/svelte/icons/rewind';
  import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
  import StepForwardIcon from '@lucide/svelte/icons/step-forward';
  import type { ScenarioInput } from '@boltzmann4d/engine/scenario';
  import { untrack } from 'svelte';
  import ArenaOptions from './ui/ArenaOptions.svelte';
  import ArenaSize from './ui/ArenaSize.svelte';
  import BoundaryButtons from './ui/BoundaryButtons.svelte';
  import ClockReadout from './ui/ClockReadout.svelte';
  import ParticlesPanel from './ui/ParticlesPanel.svelte';
  import PerformancePanel from './ui/PerformancePanel.svelte';
  import PistonPanel from './ui/PistonPanel.svelte';
  import PlayPauseButton from './ui/PlayPauseButton.svelte';
  import PressurePanel from './ui/PressurePanel.svelte';
  import RateSlider from './ui/RateSlider.svelte';
  import ScaleBar from './ui/ScaleBar.svelte';
  import ViewOptions from './ui/ViewOptions.svelte';
  import ZoomControls from './ui/ZoomControls.svelte';
  import { missingBrowserFeatures } from './ui/browser-support';
  import { arenaPoint, distanceToPolyline } from './ui/arena-point';
  import { rotateView, wasDragged } from './ui/rotate-view';
  import { zoomView } from './ui/zoom-view';
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

  // The arena follows the site's light or dark theme (VIEW-1): the `dark` class on <html>
  // that @boltzmann4d/ui's theme uses.
  $effect(() => {
    const client = sim;
    if (!client) return;
    const html = document.documentElement;
    const apply = () => client.setTheme(html.classList.contains('dark') ? 'dark' : 'light');
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
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
      use:zoomView={(update) => sim?.setZoom(update(sim.zoom))}
      tabindex="0"
      aria-label={sim?.dimension === 3
        ? 'Simulation arena; drag or use the arrow keys to turn it, tap to add a particle, pinch or + and − to zoom'
        : 'Simulation arena; tap to drop a particle, pinch or + and − to zoom'}
      onclick={(event) => {
        if (!sim || sim.loading) return;
        // 3D: a tap adds a particle at random (PART-8); dragging turns the view.
        if (sim.dimension === 3) {
          if (!wasDragged(canvas)) sim.addParticle();
          return;
        }
        // A drawn gate within a few pixels opens or closes (WALL-4).
        if (sim.arena && sim.arena.gates.length > 0) {
          const box = canvas.getBoundingClientRect();
          const at = arenaPoint(
            event.clientX - box.left,
            event.clientY - box.top,
            box,
            sim.arenaSize,
            sim.zoom,
          );
          const gate = sim.arena.gates.find(
            (g) => distanceToPolyline(at.x, at.y, g.points, g.closed) <= 10 * at.metersPerPixel,
          );
          const state = gate && sim.gates.find((g) => g.index === gate.index);
          if (state) {
            sim.setGate(state.index, !state.open);
            return;
          }
        }
        // Maxwell's demon (2D): clicking the arena opens or closes the hole, as in Java.
        if (sim.holeOpen !== null) {
          sim.setHoleOpen(!sim.holeOpen);
          return;
        }
        // Otherwise a tap drops a particle of the Particles panel's kind there (PART-8).
        const box = canvas.getBoundingClientRect();
        const at = arenaPoint(
          event.clientX - box.left,
          event.clientY - box.top,
          box,
          sim.arenaSize,
          sim.zoom,
        );
        sim.addParticle([at.x, at.y]);
      }}
    ></canvas>
    {#if sim && sim.dimension !== 3 && !sim.error}
      <ScaleBar arena={sim.arenaSize} canvas={sim.canvasSize} zoom={sim.zoom} />
    {/if}
    {#if sim && !sim.error}
      <ZoomControls zoom={sim.zoom} onZoom={(zoom) => sim?.setZoom(zoom)} />
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
        markers={sim.markers}
        canMark={sim.dimension !== 3}
        onColorMode={(mode) => sim?.setColorMode(mode)}
        onTrace={(enabled) => sim?.setTrace(enabled)}
        onClearTrace={() => sim?.clearTrace()}
        onMarkers={(enabled) => sim?.setMarkers(enabled)}
      />
    {/if}
    {#if sim?.arena}
      <ParticlesPanel
        {sim}
        showMarkers={sim.markers && sim.dimension !== 3}
        tap={sim.dimension === 3 ? 'random' : sim.holeOpen !== null ? 'other' : 'drop'}
      />
      <BoundaryButtons
        boundary={sim.arena.boundary}
        drawnWalls={sim.arena.drawnWalls}
        disabled={sim.loading}
        onChange={(boundary) => sim?.setBoundary(boundary)}
      />
      <ArenaOptions
        arena={sim.arena}
        disabled={sim.loading}
        onChange={(options) => sim?.setArenaOptions(options)}
      />
      <ArenaSize
        size={sim.arena.size}
        dimension={sim.dimension}
        disabled={sim.loading}
        onChange={(size) => sim?.setArenaOptions({ size })}
      />
    {/if}
    <div class="flex flex-wrap gap-2" role="group" aria-label="Simulation controls">
      <ClockReadout time={sim?.time ?? 0} />
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
      <!-- Reverse (SIM-32, CTRL-6): every velocity flips and the motion retraces itself. -->
      <Button
        variant="outline"
        size="icon-lg"
        disabled={!sim || sim.loading}
        aria-label="Reverse"
        title="Reverse: flip every particle’s velocity"
        onclick={() => sim?.reverse()}
      >
        <RewindIcon aria-hidden="true" />
      </Button>
      <!-- Restart (CTRL-3, PART-14): particles placed anew, the clock at zero, the Particles
           panel's pending values applied. -->
      <Button
        variant="outline"
        size="icon-lg"
        disabled={!sim || sim.loading}
        aria-label="Restart"
        title="Restart: place the particles anew at random, clock to zero"
        onclick={() => sim?.restart()}
      >
        <RotateCcwIcon aria-hidden="true" />
      </Button>
      {#each sim?.gates ?? [] as gate (gate.index)}
        <Button
          variant="outline"
          size="lg"
          aria-pressed={gate.open}
          title="Or tap the gate in the arena"
          onclick={() => sim?.setGate(gate.index, !gate.open)}
        >
          {gate.open ? 'Close' : 'Open'}
          {sim && sim.gates.length > 1 ? `gate ${gate.id}` : 'gate'}
        </Button>
      {/each}
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
    {#if sim?.pressure && sim.arena}
      <PressurePanel
        reading={sim.pressure}
        kinds={sim.kinds}
        prediction={sim.pressurePrediction}
        averagingTime={sim.pressureAveragingTime}
        showMarkers={sim.markers && sim.dimension !== 3}
        drawnWalls={sim.arena.drawnWalls}
        onPrediction={(prediction) => sim?.setPressurePrediction(prediction)}
        onAveragingTime={(seconds) => sim?.setPressureAveragingTime(seconds)}
      />
    {/if}
    {#if sim?.statistics}
      {#await statisticsPanel then { default: StatisticsPanel }}
        <StatisticsPanel
          {sim}
          summary={sim.statistics}
          showMarkers={sim.markers && sim.dimension !== 3}
        />
      {/await}
    {/if}
    <!-- Diagnostics last: particle count, frame rates and where drawing happens. -->
    {#if sim && !sim.error}
      <PerformancePanel {sim} />
    {/if}
  </aside>
</div>
