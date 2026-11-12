<!-- The Run box, always open at the top of the sidebar: the clock, play/pause, step, reverse,
     restart, the hole and gate toggles, and the speed. -->
<script lang="ts">
  import { Button } from '@boltzmann4d/ui/button';
  import RewindIcon from '@lucide/svelte/icons/rewind';
  import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
  import StepForwardIcon from '@lucide/svelte/icons/step-forward';
  import ClockReadout from './ClockReadout.svelte';
  import PlayPauseButton from './PlayPauseButton.svelte';
  import RateSlider from './RateSlider.svelte';
  import type { SimulationClient } from './simulation.svelte';

  interface Props {
    /** Absent while the simulation starts, which disables the controls. */
    sim: SimulationClient | null;
  }

  let { sim }: Props = $props();

  const headingId = $props.id();
</script>

<section
  class="bg-background/60 mb-3 min-w-0 rounded-md border px-3 pb-3 text-sm"
  aria-labelledby={headingId}
>
  <!-- Lined up with the other boxes' headings, without their fold chevron. -->
  <h2 id={headingId} class="flex min-h-10 items-center py-1.5 font-semibold">Run</h2>
  <div class="flex flex-wrap gap-2 pt-1" role="group" aria-label="Simulation controls">
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
        title="Or tap the arena"
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
</section>
