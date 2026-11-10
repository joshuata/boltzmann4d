<!-- Docs index: every page in src/docs. -->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { docs } from '../../lib/docs';
</script>

<svelte:head><title>Documentation · Boltzmann 4D</title></svelte:head>

<h1 class="mb-4 text-2xl font-semibold">Documentation</h1>
<ul class="space-y-2">
  {#each docs as doc (doc.slug)}
    <li>
      <a
        class="hover:bg-muted block rounded-md border px-4 py-3"
        href={resolve('/docs/[slug]', { slug: doc.slug })}
      >
        <span class="font-medium">{doc.title}</span>
        {#if doc.description}
          <span class="text-muted-foreground block text-sm">{doc.description}</span>
        {/if}
      </a>
    </li>
  {/each}
</ul>
