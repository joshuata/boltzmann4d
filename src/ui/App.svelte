<script lang="ts">
  import { createRenderer } from '../render';

  let canvas: HTMLCanvasElement;

  $effect(() => {
    const renderer = createRenderer(canvas);
    return () => renderer.dispose();
  });
</script>

<main>
  <canvas bind:this={canvas}></canvas>
  <aside>
    <h1>Boltzmann 4D</h1>
    <p>Controls will go here.</p>
  </aside>
</main>

<style>
  main {
    display: grid;
    grid-template-columns: 1fr 320px;
    height: 100%;
  }
  canvas {
    width: 100%;
    height: 100%;
    display: block;
    min-width: 0;
  }
  aside {
    background: var(--panel-bg);
    border-left: 1px solid var(--panel-border);
    padding: 1rem;
  }
  h1 {
    font-size: 1.25rem;
    margin: 0 0 0.5rem;
  }
  @media (max-width: 700px) {
    main {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr auto;
    }
    aside {
      border-left: none;
      border-top: 1px solid var(--panel-border);
    }
  }
</style>
