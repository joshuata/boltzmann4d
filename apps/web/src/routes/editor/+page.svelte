<!-- The simulation editor beside a preview of what it builds. Wide screens: the form on the
     left, the simulation on the right. Phones: the form, then the simulation under it. -->
<script lang="ts">
  import type { Scenario } from '@boltzmann4d/engine/scenario';
  import { SimulationEditor } from '@boltzmann4d/simulation-editor';
  import { Simulator } from '@boltzmann4d/simulator';
  import { tick } from 'svelte';

  /** The scenario last run, as a new object each time so Run always restarts it. */
  let running = $state.raw<{ name: string; scenario: Scenario } | null>(null);
  let preview: HTMLElement;

  async function run(scenario: Scenario, name: string) {
    running = { name, scenario };
    await tick();
    // On phones the preview is below the form: bring it into view.
    if (!matchMedia('(min-width: 1024px)').matches) {
      preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
</script>

<svelte:head><title>Simulation editor · Boltzmann 4D</title></svelte:head>

<div class="lg:grid lg:h-full lg:grid-cols-[420px_1fr]">
  <div class="space-y-4 px-4 py-6 lg:min-h-0 lg:overflow-y-auto lg:border-r">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold">Simulation editor</h1>
      <p class="text-muted-foreground text-sm">
        Set up the arena and particles, then run it here or download it.
      </p>
    </div>
    <SimulationEditor onRun={run} />
  </div>
  <section
    bind:this={preview}
    aria-label="Preview"
    class="h-[85dvh] scroll-mt-2 border-t lg:h-full lg:min-h-0 lg:border-t-0"
  >
    {#if running}
      <Simulator scenario={running} />
    {:else}
      <div class="text-muted-foreground flex h-full items-center justify-center p-6 text-center">
        Press Run to try the scenario here.
      </div>
    {/if}
  </section>
</div>
