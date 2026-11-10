<!--
  Distribution histogram with its theoretical curve (StatPanel.drawHistogram in the Java app).
  Bars are stacked per particle type; bars and curve are each scaled so their own maximum
  reaches 80% of the height, so the comparison is of shape (as in Java). Orange lines mark
  the predicted average ± width, green the measured average ± width.
-->
<script lang="ts">
  import { Axis, Chart, Layer, Rect, Rule, Spline } from 'layerchart/svg';
  import type { StatisticSummary } from '@boltzmann4d/engine/stats/summary';

  interface Props {
    statistic: StatisticSummary;
    cumulative: boolean;
    typeColors: number[];
    height?: number;
  }

  let { statistic, cumulative, typeColors, height = 180 }: Props = $props();

  const hex = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`;
  const distribution = $derived(cumulative ? statistic.cumulative : statistic.current);
  const [binMin, binMax] = $derived(statistic.binRange);

  /** Stacked bar segments per type, heights as a fraction of the tallest bar. */
  const bars = $derived.by(() => {
    const byType = distribution.binsByType;
    const binCount = byType[0]?.length ?? 0;
    const totals = Array.from({ length: binCount }, (_, i) =>
      byType.reduce((sum, bins) => sum + (bins[i] ?? 0), 0),
    );
    const tallest = Math.max(...totals, 0) || 1;
    const width = (binMax - binMin) / Math.max(binCount, 1);
    const stackTop = new Array<number>(binCount).fill(0);
    return byType.map((bins, slot) => ({
      color: hex(typeColors[statistic.types[slot] ?? 0] ?? 0xffffff),
      rects: bins.map((value, i) => {
        const y0 = stackTop[i]!;
        const y1 = y0 + value / tallest;
        stackTop[i] = y1;
        return { x0: binMin + i * width, x1: binMin + (i + 1) * width, y0, y1 };
      }),
    }));
  });

  /** Theoretical curve over the statistic's own range, its maximum scaled to 1. */
  const curve = $derived.by(() => {
    const points = distribution.prediction.curve;
    const [min, max] = statistic.range;
    const peak = Math.max(...points, 0) || 1;
    return points.map((y, i) => ({
      x: ((max - min) * (i + 0.5)) / points.length + min,
      y: y / peak,
    }));
  });

  const predicted = $derived(distribution.prediction);
</script>

<div class="histogram" style:height="{height}px">
  <Chart
    xDomain={[binMin, binMax]}
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
      <Spline data={curve} x="x" y="y" class="curve" />
      <Rule x={predicted.average} class="predicted" strokeWidth={2} />
      <Rule x={predicted.average - predicted.width} class="predicted" />
      <Rule x={predicted.average + predicted.width} class="predicted" />
      {#if distribution.average > 0}
        <Rule x={distribution.average} class="measured" strokeWidth={2} />
        <Rule x={distribution.average - distribution.width} class="measured" />
        <Rule x={distribution.average + distribution.width} class="measured" />
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
