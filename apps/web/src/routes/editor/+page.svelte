<script lang="ts">
  import { resolve } from '$app/paths';
  import { SimulationEditor } from '@boltzmann4d/simulation-editor';
</script>

<svelte:head><title>Simulation editor · Boltzmann 4D</title></svelte:head>

<div class="page">
  <p><a href={resolve('/')}>← Boltzmann 4D</a></p>
  <SimulationEditor />
</div>

<style>
  .page {
    max-width: 48rem;
    margin: 0 auto;
    padding: 1.5rem 1rem;
  }
</style>
