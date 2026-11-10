<!-- Speed statistics in the sidebar: which particle types, current or cumulative, the
     histogram with its Maxwell–Boltzmann curve, and measured vs predicted averages. The
     prediction uses each type's temperature in the data shown (#23). -->
<script lang="ts">
  import { Checkbox } from '@boltzmann4d/ui/checkbox';
  import { Label } from '@boltzmann4d/ui/label';
  import * as Select from '@boltzmann4d/ui/select';
  import SpeedHistogram from '../charts/SpeedHistogram.svelte';
  import type { StatisticsSummary } from '@boltzmann4d/engine/stats/summary';

  interface Props {
    summary: StatisticsSummary;
  }

  let { summary }: Props = $props();

  let selected = $state<string | null>(null);
  let cumulative = $state(false);

  const label = (types: number[]) =>
    types.map((t) => summary.typeNames[t] ?? `Type ${t + 1}`).join(' & ');
  const key = (types: number[]) => types.join(',');
  // Default to all types together (the last subset).
  const statistic = $derived(
    summary.statistics.find((s) => key(s.types) === selected) ?? summary.statistics.at(-1),
  );
  const distribution = $derived(
    statistic && (cumulative ? statistic.cumulative : statistic.current),
  );
  const cumulativeId = $props.id();
  const fmt = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });
</script>

{#if statistic && distribution}
  <section class="mt-4 border-t pt-3" aria-label="Speed statistics">
    <h2 class="mb-2 text-sm font-semibold">{statistic.label}</h2>
    <div class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      {#if summary.statistics.length > 1}
        <Select.Root
          type="single"
          value={key(statistic.types)}
          onValueChange={(value) => (selected = value)}
        >
          <Select.Trigger size="sm" aria-label="Particle types">
            {label(statistic.types)}
          </Select.Trigger>
          <Select.Content>
            {#each summary.statistics as s (key(s.types))}
              <Select.Item value={key(s.types)} label={label(s.types)} />
            {/each}
          </Select.Content>
        </Select.Root>
      {/if}
      <div class="flex min-h-8 items-center gap-2">
        <Checkbox id={cumulativeId} bind:checked={cumulative} />
        <Label for={cumulativeId}>Cumulative</Label>
      </div>
    </div>

    <SpeedHistogram {statistic} {cumulative} typeColors={summary.typeColors} />

    <dl class="mt-2 grid gap-1 text-xs tabular-nums">
      <div class="flex justify-between gap-2">
        <dt class="flex items-center gap-1.5">
          <span class="size-2.5 rounded-xs bg-green-500"></span>Measured
        </dt>
        <dd>{fmt(distribution.average)} ± {fmt(distribution.width)} {statistic.unit}</dd>
      </div>
      <div class="flex justify-between gap-2">
        <dt class="flex items-center gap-1.5">
          <span class="size-2.5 rounded-xs bg-amber-500"></span>Predicted
        </dt>
        <dd>
          {fmt(distribution.prediction.average)} ± {fmt(distribution.prediction.width)}
          {statistic.unit}
        </dd>
      </div>
      <div class="flex justify-between gap-2">
        <dt>Temperature</dt>
        <dd>
          {distribution.prediction.temperatures
            .map((t, i) =>
              statistic.types.length > 1
                ? `${label([statistic.types[i]!])} ${fmt(t)} K`
                : `${fmt(t)} K`,
            )
            .join(' · ')}
        </dd>
      </div>
    </dl>
    {#if cumulative && !summary.forgotten}
      <p class="text-muted-foreground mt-1.5 text-xs">
        Still equilibrating: early data will be dropped once.
      </p>
    {/if}
  </section>
{/if}
