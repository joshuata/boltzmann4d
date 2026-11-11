<!--
  The history view (STAT-20–22, History in the Java app): measured values over the most
  recent samples, against the prediction drawn as a red line with dotted red lines at
  ± half the predicted width. The vertical range is set by the caller (four predicted
  widths, or 0 to twice the prediction for pressures).
-->
<script lang="ts">
  import { Axis, Chart, Layer, Rule, Spline } from 'layerchart/svg';

  interface Series {
    color: string;
    /** x: time, ps; y: the value (NaN for no data). */
    points: { x: number; y: number }[];
  }

  interface Props {
    series: Series[];
    yDomain: [number, number];
    /** The predicted value and width, if there is a prediction. */
    prediction?: { value: number; width: number } | null;
    height?: number;
  }

  let { series, yDomain, prediction = null, height = 180 }: Props = $props();

  const xDomain = $derived.by((): [number, number] => {
    const xs = series.flatMap((s) => s.points.map((p) => p.x));
    if (xs.length === 0) return [0, 1];
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    return hi > lo ? [lo, hi] : [lo, lo + 1];
  });
  /** Points clamped into the range (as Java's plot cut them off at its edges). */
  const clamped = $derived(
    series.map((s) => ({
      ...s,
      points: s.points
        .filter((p) => Number.isFinite(p.y))
        .map((p) => ({ x: p.x, y: Math.min(yDomain[1], Math.max(yDomain[0], p.y)) })),
    })),
  );
  const inRange = (y: number) => Number.isFinite(y) && y >= yDomain[0] && y <= yDomain[1];
</script>

<div class="history" style:height="{height}px">
  <Chart {xDomain} {yDomain} padding={{ left: 40, right: 12, top: 6, bottom: 22 }}>
    <Layer>
      {#if prediction}
        {#if inRange(prediction.value)}
          <Rule y={prediction.value} class="predicted" strokeWidth={1.5} />
        {/if}
        {#each [prediction.value - prediction.width / 2, prediction.value + prediction.width / 2] as y, i (i)}
          {#if inRange(y)}<Rule {y} class="predicted dotted" />{/if}
        {/each}
      {/if}
      {#each clamped as s, i (i)}
        {#if s.points.length > 1}
          <Spline data={s.points} x="x" y="y" stroke={s.color} class="measured" />
        {/if}
      {/each}
      <Axis placement="left" rule ticks={4} format={(v: number) => v.toPrecision(3)} />
      <Axis placement="bottom" rule ticks={4} />
    </Layer>
  </Chart>
</div>

<style>
  .history {
    width: 100%;
  }
  .history :global(.measured) {
    stroke-width: 1.5;
    fill: none;
  }
  .history :global(.predicted) {
    stroke: #ef4444;
  }
  .history :global(.dotted) {
    stroke-dasharray: 4 3;
  }
  .history :global(text) {
    fill: currentColor;
    font-size: 0.7rem;
  }
</style>
