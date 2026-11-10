<!-- Docs: a list of pages beside (or, on phones, above) the page being read. -->
<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { docs } from '../../lib/docs';

  let { children } = $props();
</script>

<div class="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 md:flex-row">
  <nav aria-label="Documentation" class="shrink-0 md:w-48">
    <ul class="flex flex-wrap gap-1 md:flex-col">
      <li>
        <a
          href={resolve('/docs')}
          aria-current={page.route.id === '/docs' ? 'page' : undefined}
          class="hover:bg-muted aria-[current=page]:bg-muted block rounded-md px-3 py-1.5 text-sm aria-[current=page]:font-semibold"
          >Documentation</a
        >
      </li>
      {#each docs as doc (doc.slug)}
        <li>
          <a
            href={resolve('/docs/[slug]', { slug: doc.slug })}
            aria-current={page.params.slug === doc.slug ? 'page' : undefined}
            class="hover:bg-muted aria-[current=page]:bg-muted block rounded-md px-3 py-1.5 text-sm aria-[current=page]:font-semibold"
            >{doc.title}</a
          >
        </li>
      {/each}
    </ul>
  </nav>
  <div class="min-w-0 flex-1">
    {@render children()}
  </div>
</div>
