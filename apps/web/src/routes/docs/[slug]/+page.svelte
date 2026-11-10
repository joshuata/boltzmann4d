<!-- One Markdown doc page; the title comes from its frontmatter. -->
<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.info.title} · Boltzmann 4D</title></svelte:head>

<article class="prose prose-neutral dark:prose-invert max-w-none">
  <h1>{data.info.title}</h1>
  <data.content />
</article>
