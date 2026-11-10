<!-- Unknown pages and presets, and any other routing error. GitHub Pages serves the
     adapter's 404.html for missing paths, which routes here in the browser. -->
<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { Button } from '@boltzmann4d/ui/button';

  const notFound = $derived(page.status === 404);
  // SvelteKit's own messages ("Not Found") repeat the heading; show only specific ones.
  const detail = $derived(page.error?.message === 'Not Found' ? null : page.error?.message);
</script>

<svelte:head><title>{notFound ? 'Not found' : 'Error'} · Boltzmann 4D</title></svelte:head>

<div class="mx-auto max-w-3xl space-y-4 px-4 py-6">
  <p class="text-muted-foreground text-sm font-medium tabular-nums">{page.status}</p>
  <h1 class="text-2xl font-semibold">
    {notFound ? 'There’s nothing here' : 'Something went wrong'}
  </h1>
  {#if detail}
    <p class="text-muted-foreground">{detail}</p>
  {/if}
  <p class="text-muted-foreground">
    {notFound
      ? 'The page or simulation may have moved. Choose one from the list or the 2D and 3D menus.'
      : 'Try reloading the page, or go back to the list of simulations.'}
  </p>
  <div class="flex flex-wrap gap-2">
    <Button href={resolve('/')}>All simulations</Button>
    {#if !notFound}
      <Button variant="outline" onclick={() => location.reload()}>Reload</Button>
    {/if}
  </div>
</div>
