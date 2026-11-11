<!--
  Distribution histogram with its theoretical curve (StatPanel.drawHistogram in the Java app).
  Bars are stacked per particle type, or coloured like the particles when Color by Speed / KE
  matches the plot (STAT-7). Bars and curve are each scaled so their own maximum reaches 80%
  of the height, so the comparison is of shape (STAT-6). Orange lines mark the predicted
  average ± width, green the measured average ± width (STAT-5); with Width on (STAT-13)
  the ± width lines are drawn heavier.
-->
<script lang="ts">
  import { Axis, Chart, Layer, Rect, Rule, Spline } from 'layerchart/svg';
  import type { StatisticSummary } from '@boltzmann4d/engine/stats/summary';
  import { heatCss } from '../render/color-scale';

  interface Props {
    statistic: StatisticSummary;
    cumulative: boolean;
    typeColors: number[];
    /** Emphasise the ± width lines. */
    width?: boolean;
    /** Colour bars on the particles' heat scale with these limits (STAT-7). */
    heat?: [number, number] | null;
    height?: number;
  }

  let {
    statistic,
    cumulative,
    typeColors,
    width = false,
    heat = null,
    height = 180,
  }: Props = $props();

  const hex = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`;
  const distribution = $derived(cumulative ? statistic.cumulative : statistic.current);
  const [min, max] = $derived(statistic.range);

  /** Bar segments, heights as a fraction of the tallest bar: stacked per type, or one per bin. */
  const bars = $derived.by(() => {
    const byType = distribution.binsByType;
    const binCount = byType[0]?.length ?? 0;
    const totals = Array.from({ length: binCount }, (_, i) =>
      byType.reduce((sum, bins) => sum + (bins[i] ?? 0), 0),
    );
    const tallest = Math.max(...totals, 0) || 1;
    const binWidth = (max - min) / Math.max(binCount, 1);
    const edges = (i: number) => ({ x0: min + i * binWidth, x1: min + (i + 1) * binWidth });
    if (heat) {
      return totals.map((total, i) => ({
        color: heatCss(min + (i + 0.5) * binWidth, heat[0], heat[1]),
        rects: [{ ...edges(i), y0: 0, y1: total / tallest }],
      }));
    }
    const stackTop = new Array<number>(binCount).fill(0);
    return byType.map((bins, slot) => ({
      color: hex(typeColors[statistic.types[slot] ?? 0] ?? 0xffffff),
      rects: bins.map((value, i) => {
        const y0 = stackTop[i]!;
        const y1 = y0 + value / tallest;
        stackTop[i] = y1;
        return { ...edges(i), y0, y1 };
      }),
    }));
  });

  /** Theoretical curve over the range, its maximum scaled to 1. */
  const curve = $derived.by(() => {
    const points = distribution.prediction.curve;
    const peak = Math.max(...points, 0) || 1;
    return points.map((y, i) => ({
      x: ((max - min) * (i + 0.5)) / points.length + min,
      y: y / peak,
    }));
  });

  const predicted = $derived(distribution.prediction);
  const hasData = $derived(distribution.binsByType.some((bins) => bins.some((b) => b > 0)));
  const edge = $derived(width ? 2 : 1);
  /** Lines off the axis aren't drawn. */
  const inRange = (x: number) => Number.isFinite(x) && x >= min && x <= max;
</script>

<div class="histogram" style:height="{height}px">
  <Chart
    xDomain={[min, max]}
    yDomain={[0, 1.25]}
    padding={{ left: 8, right: 12, top: 4, bottom: 22 }}
  >
    <Layer>
      {#each bars as series, slot (slot)}
        <Rect
          data={series.rects}
          x0="x0"
          x1="x1"
          y0="y0"
          y1="y1"
          fill={series.color}
          fillOpacity={0.75}
        />
      {/each}
      {#if curve.some((p) => p.y > 0)}
        <Spline data={curve} x="x" y="y" class="curve" />
      {/if}
      {#if inRange(predicted.average)}
        <Rule x={predicted.average} class="predicted" strokeWidth={2} />
      {/if}
      {#each [predicted.average - predicted.width, predicted.average + predicted.width] as x, i (i)}
        {#if inRange(x)}<Rule {x} class="predicted" strokeWidth={edge} />{/if}
      {/each}
      {#if hasData}
        {#if inRange(distribution.average)}
          <Rule x={distribution.average} class="measured" strokeWidth={2} />
        {/if}
        {#each [distribution.average - distribution.width, distribution.average + distribution.width] as x, i (i)}
          {#if inRange(x)}<Rule {x} class="measured" strokeWidth={edge} />{/if}
        {/each}
      {/if}
      <Axis placement="bottom" rule ticks={4} />
    </Layer>
  </Chart>
</div>

<style>
  .histogram {
    width: 100%;
  }
  .histogram :global(.curve) {
    stroke: currentColor;
    stroke-width: 1.5;
    fill: none;
  }
  .histogram :global(.predicted) {
    stroke: #f59e0b;
  }
  .histogram :global(.measured) {
    stroke: #22c55e;
  }
  .histogram :global(text) {
    fill: currentColor;
    font-size: 0.7rem;
  }
</style>
