<!-- A particle kind's colour and marker (KIND-9), drawn as its particles look in 2D. -->
<script lang="ts">
  import { MARKER_SHAPES, markerColor } from '../render/markers';

  interface Props {
    /** 0xRRGGBB. */
    color: number;
    marker: string;
    /** Draw the marker (off when the View menu turns markers off). */
    showMarker?: boolean;
    size?: number;
  }

  let { color, marker, showMarker = true, size = 14 }: Props = $props();

  const hex = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`;
  const contrast = $derived(
    hex(markerColor(((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255)),
  );
  // SVG's y axis points down; marker shapes are drawn with y up.
  const points = (pts: readonly (readonly [number, number])[]) =>
    pts.map(([x, y]) => `${x},${-y}`).join(' ');
</script>

<svg width={size} height={size} viewBox="-1.1 -1.1 2.2 2.2" aria-hidden="true" class="shrink-0">
  <circle r="1" fill={hex(color)} stroke="currentColor" stroke-opacity="0.35" stroke-width="0.12" />
  {#if showMarker}
    {#each MARKER_SHAPES[marker] ?? [] as shape, i (i)}
      {#if shape.type === 'circle'}
        <circle r={shape.radius} fill={contrast} />
      {:else}
        <polygon points={points(shape.points)} fill={contrast} />
      {/if}
    {/each}
  {/if}
</svg>
