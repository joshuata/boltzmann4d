<!-- Home: choose a bundled simulation, upload settings, or open the editor. -->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { presetCatalog } from '@boltzmann4d/engine/io/presets';
  import { Button } from '@boltzmann4d/ui/button';

  const groups = [
    { title: '2D', presets: presetCatalog.filter((p) => p.dimensions === 2) },
    { title: '3D', presets: presetCatalog.filter((p) => p.dimensions === 3) },
  ];
</script>

<svelte:head><title>Boltzmann 4D</title></svelte:head>

<div class="mx-auto max-w-3xl space-y-6 px-4 py-6">
  <div class="space-y-2">
    <h1 class="text-2xl font-semibold">Boltzmann 4D</h1>
    <p class="text-muted-foreground">
      A kinetic theory demonstrator: an event-driven hard-sphere gas in 2D and 3D.
    </p>
  </div>
  <nav class="flex flex-wrap gap-2" aria-label="Other tools">
    <Button variant="outline" href={resolve('/upload')}>Upload settings</Button>
    <Button variant="outline" href={resolve('/editor')}>Simulation editor</Button>
  </nav>
  {#each groups as group (group.title)}
    <section class="space-y-2">
      <h2 class="text-lg font-semibold">{group.title}</h2>
      <ul class="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2">
        {#each group.presets as preset (preset.name)}
          <li>
            <a
              class="hover:bg-muted block rounded-md border px-3 py-2 text-sm"
              href={resolve('/simulate/[preset]', { preset: preset.name })}>{preset.label}</a
            >
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>
