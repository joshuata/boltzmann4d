<!-- Home: choose a bundled simulation, upload settings, or open the editor. -->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { presetCatalog } from '@boltzmann4d/engine/io/presets';

  const groups = [
    { title: '2D', presets: presetCatalog.filter((p) => p.dimensions === 2) },
    { title: '3D', presets: presetCatalog.filter((p) => p.dimensions === 3) },
  ];
</script>

<svelte:head><title>Boltzmann 4D</title></svelte:head>

<div class="page">
  <h1>Boltzmann 4D</h1>
  <p>A kinetic theory demonstrator: an event-driven hard-sphere gas in 2D and 3D.</p>
  <nav class="actions" aria-label="Other tools">
    <a href={resolve('/upload')}>Upload settings</a>
    <a href={resolve('/editor')}>Simulation editor</a>
  </nav>
  {#each groups as group (group.title)}
    <section>
      <h2>{group.title}</h2>
      <ul>
        {#each group.presets as preset (preset.name)}
          <li>
            <a href={resolve('/simulate/[preset]', { preset: preset.name })}>{preset.label}</a>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>

<style>
  .page {
    max-width: 48rem;
    margin: 0 auto;
    padding: 1.5rem 1rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }
  ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: 0.5rem;
    padding: 0;
    list-style: none;
  }
  a {
    color: var(--focus-ring);
  }
</style>
