<!-- The scenario editor (plan 0010). Run swaps the editor for the simulator running the
     scenario; Back returns to the editor as it was (EDIT-18). The editor stays mounted while
     the simulation runs, so nothing is lost. -->
<script lang="ts">
  import type { Scenario } from '@boltzmann4d/engine/scenario';
  import { SimulationEditor } from '@boltzmann4d/simulation-editor';
  import { Simulator } from '@boltzmann4d/simulator';
  import { Button } from '@boltzmann4d/ui/button';
  import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';

  /** The scenario running, as a new object each time so Run always restarts it. */
  let running = $state.raw<{ name: string; scenario: Scenario } | null>(null);
</script>

<svelte:head>
  <title>{running ? `${running.name} · ` : ''}Scenario editor · Boltzmann 4D</title>
</svelte:head>

<div class={['lg:h-full lg:min-h-0', running && 'hidden']}>
  <SimulationEditor onRun={(scenario, name) => (running = { name, scenario })} />
</div>
{#if running}
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex items-center gap-3 border-b px-3 py-2">
      <Button variant="outline" size="sm" onclick={() => (running = null)}>
        <ArrowLeftIcon aria-hidden="true" />
        Back to the editor
      </Button>
      <span class="truncate text-sm font-medium">Running {running.name}</span>
    </div>
    <div class="min-h-0 flex-1">
      <Simulator scenario={running} />
    </div>
  </div>
{/if}
