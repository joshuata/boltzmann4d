<!-- About (HELP-1): credits, licence and version, in a dialog so a running simulation
     keeps going underneath. The text is src/docs/about.md, also at /docs/about. -->
<script lang="ts">
  import * as Dialog from '@boltzmann4d/ui/dialog';
  import About, { metadata } from '../docs/about.md';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  const version = [import.meta.env.BUILD_DATE, import.meta.env.BUILD_COMMIT]
    .filter(Boolean)
    .join(' · ');
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Boltzmann 4D</Dialog.Title>
      <Dialog.Description>{String(metadata.description)}</Dialog.Description>
    </Dialog.Header>
    <div class="prose prose-sm prose-neutral dark:prose-invert">
      <About />
    </div>
    {#if version}
      <p class="text-muted-foreground text-xs tabular-nums">Version: {version}</p>
    {/if}
  </Dialog.Content>
</Dialog.Root>
