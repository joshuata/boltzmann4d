<!-- Home: the bundled simulations grouped by topic, each with what it shows and a link per
     dimension; plus the quick start, your scenarios (and your default, FILE-2) and the editor. -->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { getDefaultScenario } from '@boltzmann4d/simulation-editor';
  import { Button } from '@boltzmann4d/ui/button';
  import { presetGuide } from '../lib/preset-guide';
  import { withQuery } from '../lib/with-query';

  /** The scenario the user made their default (FILE-2), if any. */
  let userDefault = $state.raw<{ id: string; name: string } | null>(null);
  $effect(() => {
    getDefaultScenario()
      .then((entry) => (userDefault = entry && { id: entry.id, name: entry.name }))
      // No storage in this browser: no default to offer.
      .catch(() => (userDefault = null));
  });
</script>

<svelte:head><title>Boltzmann 4D</title></svelte:head>

<div class="mx-auto max-w-4xl space-y-8 px-4 py-6">
  <div class="space-y-3">
    <h1 class="text-2xl font-semibold">Boltzmann 4D</h1>
    <p class="text-muted-foreground max-w-prose">
      A kinetic theory demonstrator: watch a gas of hard spheres collide in 2D and 3D, and compare
      what it does with the predictions of kinetic theory. Pick a simulation below to start.
    </p>
    <nav class="flex flex-wrap gap-2" aria-label="Get started">
      <Button variant="outline" href={resolve('/docs/[slug]', { slug: 'quick-start' })}>
        Quick start
      </Button>
      {#if userDefault}
        <Button href={withQuery(resolve('/upload'), { id: userDefault.id })}>
          Run your default: {userDefault.name}
        </Button>
      {/if}
      <Button variant="outline" href={resolve('/upload')}>Your scenarios</Button>
      <Button variant="outline" href={resolve('/editor')}>Simulation editor</Button>
    </nav>
  </div>

  {#each presetGuide as topic (topic.title)}
    <section class="space-y-3">
      <h2 class="text-lg font-semibold">{topic.title}</h2>
      <ul class="grid gap-3 sm:grid-cols-2">
        {#each topic.entries as entry (entry.title)}
          <li class="flex flex-col gap-3 rounded-lg border p-4">
            <div class="flex-1 space-y-1">
              <h3 class="font-medium">{entry.title}</h3>
              {#if entry.description}
                <p class="text-muted-foreground text-sm">{entry.description}</p>
              {/if}
            </div>
            <div class="flex gap-2">
              {#each entry.presets as preset (preset.name)}
                <Button
                  size="sm"
                  variant="secondary"
                  href={resolve('/simulate/[preset]', { preset: preset.name })}
                  aria-label={`${entry.title} in ${preset.dimensions}D`}
                >
                  {preset.dimensions}D
                </Button>
              {/each}
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>
