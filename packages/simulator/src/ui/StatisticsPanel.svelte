<!-- The statistics area (STAT-1–23): a plot picker, which particle kinds (KIND-4), the
     Cumulative / Width / History views, the histogram with its predicted curve or the
     history plot, editable axis limits, measured vs predicted readouts, and the statistics
     options (finite-system corrections, forget time, Ideal / Real). Everything comes from
     the SimulationClient; predictions use each kind's temperature in the data shown (#23). -->
<script lang="ts">
  import SidebarPanel from './SidebarPanel.svelte';
  import { Button } from '@boltzmann4d/ui/button';
  import { Checkbox } from '@boltzmann4d/ui/checkbox';
  import * as Collapsible from '@boltzmann4d/ui/collapsible';
  import { Input } from '@boltzmann4d/ui/input';
  import { Label } from '@boltzmann4d/ui/label';
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
  import type { StatisticsSummary } from '@boltzmann4d/engine/stats/summary';
  import type { PressureRegion } from '@boltzmann4d/engine/stats/pressure';
  import DistributionHistogram from '../charts/DistributionHistogram.svelte';
  import HistoryChart from '../charts/HistoryChart.svelte';
  import KindPicker from './KindPicker.svelte';
  import type { PlotId, SimulationClient } from './simulation.svelte';

  interface Props {
    sim: SimulationClient;
    summary: StatisticsSummary;
    showMarkers: boolean;
  }

  let { sim, summary, showMarkers }: Props = $props();

  const REGION_LABELS: Record<PressureRegion, string> = {
    arena: '',
    left: ' (left)',
    right: ' (right)',
  };
  const hex = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`;
  const fmt = (value: number) =>
    Number.isFinite(value) ? value.toLocaleString('en-US', { maximumSignificantDigits: 3 }) : '—';
  const key = (types: number[]) => types.join(',');
  const label = (t: number) => summary.typeNames[t] ?? `Type ${t + 1}`;
  const ps = (seconds: number) => seconds * 1e12;

  /** Every plot offered: the statistics, then the pressure in each region (STAT-1). */
  const plots = $derived.by(() => {
    const list: { id: PlotId; label: string }[] = summary.available.map((s) => ({
      id: s.id,
      label: s.label,
    }));
    const reading = sim.pressure;
    if (reading) {
      const name = reading.method === 'virial' ? 'Virial pressure' : 'Wall pressure';
      for (const r of reading.regions) {
        list.push({ id: `PRESSURE:${r.region}`, label: name + REGION_LABELS[r.region] });
      }
    }
    return list;
  });
  const plot = $derived<PlotId>(
    plots.some((p) => p.id === sim.plot) ? sim.plot : 'INSTANTANEOUS_SPEED',
  );
  const pressureRegion = $derived(
    plot.startsWith('PRESSURE:') ? (plot.slice('PRESSURE:'.length) as PressureRegion) : null,
  );

  /** The kinds covered: the picked ones, or all (STAT-23). */
  const kindsShown = $derived(sim.statKinds ?? summary.typeNames.map((_, t) => t));
  /** The selected statistic for the picked kinds, once the worker has summarised it. */
  const statistic = $derived.by(() => {
    if (summary.selected !== plot) return null;
    const all =
      summary.statistics.find((s) => s.types.length === summary.typeNames.length) ??
      summary.statistics.at(-1);
    const picked = sim.statKinds;
    return (picked && summary.statistics.find((s) => key(s.types) === key(picked))) || all || null;
  });
  const perParticle = $derived(statistic?.weighting === 'perParticle');
  /** Plots with no distribution always show history (STAT-22). */
  const historyOnly = $derived(pressureRegion !== null || plot === 'NUMBER_OF_PARTICLES');
  const history = $derived(historyOnly || sim.statView.history);
  const cumulative = $derived(sim.statView.cumulative && !perParticle);
  const distribution = $derived(
    statistic && (cumulative ? statistic.cumulative : statistic.current),
  );

  /** STAT-7: bars in the particles' colours when the colour mode matches the plot. */
  const heat = $derived(
    sim.colorMode === 'SPEED' && plot === 'INSTANTANEOUS_SPEED'
      ? summary.colorLimits.speed
      : sim.colorMode === 'KE' && plot === 'KINETIC_ENERGY'
        ? summary.colorLimits.energy
        : null,
  );

  // History data (STAT-20, 21).
  const times = $derived(summary.historyTimes.map(ps));
  const distributionHistory = $derived.by(() => {
    if (!statistic || !distribution) return null;
    const values = cumulative ? statistic.history.cumulative : statistic.history.current;
    const color =
      statistic.types.length === 1 ? hex(summary.typeColors[statistic.types[0]!]!) : 'currentColor';
    const { average, width } = distribution.prediction;
    const spread = width > 0 ? 2 * width : Math.abs(average) || 1;
    return {
      series: [{ color, points: values.map((y, i) => ({ x: times[i]!, y })) }],
      prediction: { value: average, width },
      yDomain: [average - spread, average + spread] as [number, number],
    };
  });
  const pressureHistory = $derived.by(() => {
    if (!pressureRegion) return null;
    const sumOf = (values: number[]) => kindsShown.reduce((sum, k) => sum + (values[k] ?? 0), 0);
    const points = sim.pressureHistory.map((reading) => {
      const region = reading.regions.find((r) => r.region === pressureRegion);
      return { x: ps(reading.time), y: region ? sumOf(region.measured) : NaN };
    });
    const latest = sim.pressure?.regions.find((r) => r.region === pressureRegion);
    const predicted = latest
      ? sumOf(sim.pressurePrediction === 'REAL' ? latest.real : latest.ideal)
      : NaN;
    const measured = latest ? sumOf(latest.measured) : NaN;
    // For pressures the width is the pressure itself: 0 to twice the prediction (STAT-21).
    const top =
      predicted > 0
        ? 2 * predicted
        : Math.max(1, ...points.map((p) => p.y).filter(Number.isFinite)) * 1.2;
    return {
      series: [{ color: 'currentColor', points }],
      prediction: predicted > 0 ? { value: predicted, width: predicted } : null,
      yDomain: [0, top] as [number, number],
      measured,
      predicted,
      unit: sim.pressure?.unit ?? '',
    };
  });
  const countHistory = $derived.by(() => {
    if (plot !== 'NUMBER_OF_PARTICLES') return null;
    const total = summary.counts.at(-1)?.reduce((a, b) => a + b, 0) ?? 1;
    return {
      series: kindsShown.map((t) => ({
        color: hex(summary.typeColors[t] ?? 0xffffff),
        points: summary.counts.map((c, i) => ({ x: times[i]!, y: c[t] ?? 0 })),
      })),
      yDomain: [0, Math.max(1, total)] as [number, number],
      latest: summary.counts.at(-1) ?? [],
    };
  });

  // Axis limits (STAT-8): the fields show the plot's range until edited.
  const limitText = (value: number) => (Number.isFinite(value) ? Number(value.toPrecision(4)) : 0);
  let minField = $derived(limitText(statistic?.range[0] ?? 0));
  let maxField = $derived(limitText(statistic?.range[1] ?? 0));
  const commitLimit = (edge: 'min' | 'max', value: number) => {
    if (statistic && Number.isFinite(value)) sim.setStatLimit(statistic.id, edge, value);
  };

  let forgetField = $derived(sim.forgetMultiplier);
  let optionsOpen = $state(false);
  const ids = $props.id();
  const plotLabel = $derived(plots.find((p) => p.id === plot)?.label ?? 'Statistics');
  const selectClass =
    'border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 min-w-0 flex-1 rounded-md border bg-transparent px-2.5 text-base shadow-xs outline-none focus-visible:ring-3 md:text-sm';
</script>

<SidebarPanel id="statistics" title="Statistics">
  <div class="mb-2 flex items-center gap-2">
    <Label for="{ids}-plot" class="sr-only">Plot</Label>
    <select
      id="{ids}-plot"
      class={selectClass}
      value={plot}
      onchange={(e) => sim.setPlot(e.currentTarget.value as PlotId)}
    >
      {#each plots as option (option.id)}
        <option value={option.id}>{option.label}</option>
      {/each}
    </select>
  </div>

  <div class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
    {#if sim.kinds.length > 1}
      <KindPicker
        kinds={sim.kinds}
        selected={sim.statKinds}
        {showMarkers}
        onChange={(types) => sim.setStatKinds(types)}
      />
    {/if}
    {#if !historyOnly}
      <div class="flex min-h-8 items-center gap-2">
        <Checkbox
          id="{ids}-cumulative"
          checked={cumulative}
          disabled={perParticle}
          onCheckedChange={(checked) => sim.setStatView({ cumulative: checked })}
        />
        <Label for="{ids}-cumulative">Cumulative</Label>
      </div>
      <div class="flex min-h-8 items-center gap-2">
        <Checkbox
          id="{ids}-width"
          checked={sim.statView.width}
          onCheckedChange={(checked) => sim.setStatView({ width: checked })}
        />
        <Label for="{ids}-width">Width</Label>
      </div>
      <div class="flex min-h-8 items-center gap-2">
        <Checkbox
          id="{ids}-history"
          checked={sim.statView.history}
          onCheckedChange={(checked) => sim.setStatView({ history: checked })}
        />
        <Label for="{ids}-history">History</Label>
      </div>
    {/if}
  </div>

  <div aria-label="{plotLabel}{history ? ' history' : ''}" role="img">
    {#if pressureHistory}
      <HistoryChart {...pressureHistory} />
    {:else if countHistory}
      <HistoryChart series={countHistory.series} yDomain={countHistory.yDomain} />
    {:else if statistic && history && distributionHistory}
      <HistoryChart {...distributionHistory} />
    {:else if statistic}
      <DistributionHistogram
        {statistic}
        {cumulative}
        width={sim.statView.width}
        typeColors={summary.typeColors}
        {heat}
      />
    {:else}
      <div class="text-muted-foreground flex h-[180px] items-center justify-center text-xs">
        Collecting…
      </div>
    {/if}
  </div>
  {#if history && !historyOnly}
    <p class="text-muted-foreground text-xs">Time (ps) →</p>
  {/if}

  {#if statistic && !history}
    <div class="mt-1 grid grid-cols-2 gap-2 text-xs">
      <div class="flex min-w-0 items-center gap-1.5">
        <Label for="{ids}-min" class="text-xs font-normal">Min</Label>
        <Input
          id="{ids}-min"
          type="number"
          step="any"
          class="h-8 min-w-0 flex-1 text-xs"
          bind:value={minField}
          onchange={() => commitLimit('min', minField)}
        />
      </div>
      <div class="flex min-w-0 items-center gap-1.5">
        <Label for="{ids}-max" class="text-xs font-normal">Max</Label>
        <Input
          id="{ids}-max"
          type="number"
          step="any"
          class="h-8 min-w-0 flex-1 text-xs"
          bind:value={maxField}
          onchange={() => commitLimit('max', maxField)}
        />
        <span class="text-muted-foreground shrink-0">{statistic.unit}</span>
      </div>
    </div>
  {/if}

  <dl class="mt-2 grid gap-1 text-xs tabular-nums">
    {#if statistic && distribution}
      {@const what = sim.statView.width ? 'width' : 'average'}
      <div class="flex justify-between gap-2">
        <dt class="flex items-center gap-1.5">
          <span class={history ? 'bg-foreground h-0.5 w-3' : 'size-2.5 rounded-xs bg-green-500'}
          ></span>Measured {what}
        </dt>
        <dd>{fmt(distribution[what])} {statistic.unit}</dd>
      </div>
      <div class="flex justify-between gap-2">
        <dt class="flex items-center gap-1.5">
          <span class={history ? 'h-0.5 w-3 bg-red-500' : 'size-2.5 rounded-xs bg-amber-500'}
          ></span>Predicted {what}
        </dt>
        <dd>{fmt(distribution.prediction[what])} {statistic.unit}</dd>
      </div>
      <div class="flex justify-between gap-2">
        <dt>Temperature</dt>
        <dd>
          {distribution.prediction.temperatures
            .map((t, i) =>
              statistic.types.length > 1
                ? `${label(statistic.types[i]!)} ${fmt(t)} K`
                : `${fmt(t)} K`,
            )
            .join(' · ')}
        </dd>
      </div>
    {:else if pressureHistory}
      <div class="flex justify-between gap-2">
        <dt>Measured</dt>
        <dd>{fmt(pressureHistory.measured)} {pressureHistory.unit}</dd>
      </div>
      <div class="flex justify-between gap-2">
        <dt class="flex items-center gap-1.5">
          <span class="h-0.5 w-3 bg-red-500"></span>Predicted ({sim.pressurePrediction === 'REAL'
            ? 'Real'
            : 'Ideal'})
        </dt>
        <dd>{fmt(pressureHistory.predicted)} {pressureHistory.unit}</dd>
      </div>
    {:else if countHistory}
      {#each kindsShown as t (t)}
        <div class="flex justify-between gap-2">
          <dt class="flex items-center gap-1.5">
            <span
              class="size-2.5 rounded-xs"
              style:background-color={hex(summary.typeColors[t] ?? 0)}
            ></span>{label(t)}
          </dt>
          <dd>{countHistory.latest[t] ?? 0}</dd>
        </div>
      {/each}
    {/if}
  </dl>

  {#if perParticle}
    <p class="text-muted-foreground mt-1.5 text-xs">
      One value per particle: its own average since the start. The spread narrows as the run goes
      on, so there is no cumulative view.
    </p>
  {:else if statistic && cumulative && !summary.forgotten}
    <p class="text-muted-foreground mt-1.5 text-xs">
      Still equilibrating: data before {fmt(ps(summary.forgetTime))} ps will be dropped once.
    </p>
  {/if}

  <Collapsible.Root bind:open={optionsOpen} class="mt-2">
    <Collapsible.Trigger
      class="text-muted-foreground hover:text-foreground -mx-1 flex min-h-8 w-[calc(100%+0.5rem)] items-center justify-between rounded-md px-1 text-xs font-medium"
    >
      Statistics options
      <ChevronDownIcon
        class={['size-4 transition-transform', optionsOpen && 'rotate-180']}
        aria-hidden="true"
      />
    </Collapsible.Trigger>
    <Collapsible.Content class="grid gap-2 pt-1 text-xs">
      <div class="flex min-h-8 items-center gap-2">
        <Checkbox
          id="{ids}-finite"
          checked={sim.finiteCorrections}
          onCheckedChange={(checked) => sim.setFiniteCorrections(checked)}
        />
        <Label for="{ids}-finite" class="text-xs font-normal">Finite-system corrections</Label>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Label for="{ids}-forget" class="text-xs font-normal">Forget early data after</Label>
        <Input
          id="{ids}-forget"
          type="number"
          min="0"
          step="1"
          class="h-8 w-16 text-xs"
          bind:value={forgetField}
          onchange={() => sim.setForgetMultiplier(forgetField)}
        />
        <span>collision times</span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span>Path, time and rate predictions</span>
        <div class="flex gap-1" role="group" aria-label="Path, time and rate predictions">
          {#each [{ value: 'IDEAL', label: 'Ideal' }, { value: 'REAL', label: 'Real' }] as const as option (option.value)}
            <Button
              variant={sim.pressurePrediction === option.value ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={sim.pressurePrediction === option.value}
              onclick={() => sim.setPressurePrediction(option.value)}
            >
              {option.label}
            </Button>
          {/each}
        </div>
      </div>
      <p class="text-muted-foreground">
        Ideal / Real is shared with the pressure readout. Changing a plot’s min or max clears that
        plot’s cumulative data.
      </p>
    </Collapsible.Content>
  </Collapsible.Root>
</SidebarPanel>
