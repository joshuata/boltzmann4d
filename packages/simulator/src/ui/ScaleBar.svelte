<!-- A scale bar over the 2D arena (the Java app's nm rulers): a round length in nm, sized
     from how the 2D view fits the arena to the canvas (view-2d.ts) and the zoom. -->
<script lang="ts">
  interface Props {
    /** Arena size, m. */
    arena: { width: number; height: number };
    /** Canvas size, CSS pixels. */
    canvas: { width: number; height: number };
    /** The view's zoom (CTRL-7): 1 fits the arena. */
    zoom?: number;
  }

  let { arena, canvas, zoom = 1 }: Props = $props();

  /** Space around the arena, as a fraction of its larger side (view-2d.ts MARGIN). */
  const MARGIN = 0.04;

  const bar = $derived.by(() => {
    const x = arena.width * 1e9;
    const y = arena.height * 1e9;
    if (!(x > 0 && y > 0 && canvas.width > 0 && canvas.height > 0)) return null;
    const margin = MARGIN * Math.max(x, y);
    let halfW = x / 2 + margin;
    const halfH = y / 2 + margin;
    const aspect = canvas.width / canvas.height;
    if (halfW / halfH < aspect) halfW = halfH * aspect;
    const nmPerPixel = (2 * halfW) / zoom / canvas.width;
    // A round length about a fifth of the canvas wide: 1, 2 or 5 × 10^k nm.
    const target = (canvas.width / 5) * nmPerPixel;
    const power = 10 ** Math.floor(Math.log10(target));
    const nm = [5, 2, 1].map((m) => m * power).find((v) => v <= target) ?? power;
    return { nm, pixels: nm / nmPerPixel };
  });
</script>

{#if bar}
  <div class="scale" aria-label="Scale: {bar.nm} nm">
    <div class="bar" style:width="{bar.pixels}px"></div>
    <span>{bar.nm} nm</span>
  </div>
{/if}

<style>
  .scale {
    position: absolute;
    left: 0.75rem;
    bottom: 0.5rem;
    display: grid;
    justify-items: start;
    gap: 0.15rem;
    color: #fff;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    text-shadow: 0 0 2px #000;
  }
  .bar {
    height: 0.35rem;
    border: 1px solid #fff;
    border-top: none;
  }
</style>
