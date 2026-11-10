<!-- Runs one bundled preset. Moving to another preset's page reuses the running viewer,
     which loads the new preset in place. -->
<script lang="ts">
  import { Simulator } from '@boltzmann4d/simulator';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.label} ({data.dimensions}D) · Boltzmann 4D</title></svelte:head>

<Simulator preset={data.preset} />
