<!--
  A speed histogram computed on the main thread from a state snapshot alone
  (joshuata/boltzmann4d#84): an example of a custom, instantaneous statistic. It should
  track the built-in Instantaneous Speed plot (STAT-1). Bars are stacked by the colour each
  particle shows, scaled so the tallest reaches 80% of the height.
-->
<script lang="ts">
  import { Axis, Chart, Layer, Rect } from 'layerchart/svg';
  import { speedsOf, type StateSnapshot } from '@boltzmann4d/engine/sim';
  import { HistogramBins } from '@boltzmann4d/engine/stats/histogram-bins';

  interface Props {
    snapshot: StateSnapshot;
    /** Per type, 0xRRGGBB. */
    typeColors: number[];
    /** Speed axis, m/s; by default 0 to a little past the fastest particle. */
    range?: [number, number];
    bins?: number;
    height?: number;
  }

  let { snapshot, typeColors, range, bins = 15, height = 160 }: Props = $props();

  const hex = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`;
  const speeds = $derived(speedsOf(snapshot));
  const axis = $derived.by((): [number, number] => {
    if (range) return range;
    const fastest = Math.max(0, ...speeds);
    return [0, Math.max(100, Math.ceil((fastest * 1.1) / 100) * 100)];
  });
  const histogram = $derived.by(() => {
    const [min, max] = axis;
    // Sized by the snapshot: the colours may still be the previous scenario's.
    const types = Math.max(typeColors.length, ...Array.from(snapshot.colors, (c) => c + 1));
    const h = new HistogramBins({ min, max }, bins, types);
    for (let k = 0; k < snapshot.count; k++) h.add(speeds[k]!, 1, snapshot.colors[k]!);
    return h;
  });
  const mean = $derived(speeds.reduce((sum, s) => sum + s, 0) / Math.max(1, snapshot.count));

  const bars = $derived.by(() => {
    const [min, max] = axis;
    const width = (max - min) / bins;
    const tallest = Math.max(...histogram.total, 0) || 1;
    const top = new Array<number>(bins).fill(0);
    return histogram.byType.map((counts, type) => ({
      color: hex(typeColors[type] ?? 0xffffff),
      rects: Array.from(counts, (count, i) => {
        const y0 = top[i]!;
        top[i] = y0 + (0.8 * count) / tallest;
        return { x0: min + i * width, x1: min + (i + 1) * width, y0, y1: top[i] };
      }),
    }));
  });
</script>

<figure class="space-y-1">
  <div style:height="{height}px" class="w-full text-xs">
    <Chart xDomain={axis} yDomain={[0, 1]} padding={{ left: 8, right: 12, top: 4, bottom: 22 }}>
      <Layer>
        {#each bars as series, type (type)}
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
        <Axis placement="bottom" rule ticks={4} />
      </Layer>
    </Chart>
  </div>
  <figcaption class="text-muted-foreground text-xs tabular-nums">
    {snapshot.count} particles at {(snapshot.time * 1e12).toFixed(1)} ps · mean speed
    {mean.toFixed(0)} m/s
  </figcaption>
</figure>
