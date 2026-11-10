<!-- Runs one bundled preset; picking another in the sidebar navigates to its page. -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Simulator } from '@boltzmann4d/simulator';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.label} ({data.dimensions}D) · Boltzmann 4D</title></svelte:head>

<Simulator
  preset={data.preset}
  onPresetChange={(name) =>
    goto(resolve('/simulate/[preset]', { preset: name }), {
      replace: true,
      reset: false,
    })}
>
  {#snippet header()}
    <h1><a href={resolve('/')}>Boltzmann 4D</a></h1>
  {/snippet}
</Simulator>

<style>
  h1 a {
    color: inherit;
    text-decoration: none;
  }
</style>
