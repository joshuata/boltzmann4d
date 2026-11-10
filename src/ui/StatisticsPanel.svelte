<!-- Speed statistics in the sidebar: which particle types, current or cumulative, the
     histogram with its Maxwell–Boltzmann curve, and measured vs predicted averages. The
     prediction uses each type's temperature in the data shown (#23). -->
<script lang="ts">
  import SpeedHistogram from '../charts/SpeedHistogram.svelte';
  import type { StatisticsSummary } from '../stats/summary';

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
  const fmt = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });
</script>

{#if statistic && distribution}
  <section class="statistics" aria-label="Speed statistics">
    <h2>{statistic.label}</h2>
    <div class="controls">
      {#if summary.statistics.length > 1}
        <select
          aria-label="Particle types"
          value={key(statistic.types)}
          onchange={(event) => (selected = (event.currentTarget as HTMLSelectElement).value)}
        >
          {#each summary.statistics as s (key(s.types))}
            <option value={key(s.types)}>{label(s.types)}</option>
          {/each}
        </select>
      {/if}
      <label class="toggle">
        <input type="checkbox" bind:checked={cumulative} />
        Cumulative
      </label>
    </div>

    <SpeedHistogram {statistic} {cumulative} typeColors={summary.typeColors} />

    <dl class="readouts">
      <div>
        <dt><span class="swatch measured"></span>Measured</dt>
        <dd>{fmt(distribution.average)} ± {fmt(distribution.width)} {statistic.unit}</dd>
      </div>
      <div>
        <dt><span class="swatch predicted"></span>Predicted</dt>
        <dd>
          {fmt(distribution.prediction.average)} ± {fmt(distribution.prediction.width)}
          {statistic.unit}
        </dd>
      </div>
      <div>
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
      <p class="note">Still equilibrating: early data will be dropped once.</p>
    {/if}
  </section>
{/if}

<style>
  .statistics {
    margin-top: 1rem;
    border-top: 1px solid var(--panel-border);
    padding-top: 0.75rem;
  }
  h2 {
    font-size: 0.95rem;
    margin: 0 0 0.5rem;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    align-items: center;
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
  }
  select {
    font: inherit;
    padding: 0.3rem 0.4rem;
    border: 1px solid var(--panel-border);
    border-radius: 0.375rem;
    background: var(--button-bg);
    color: inherit;
    min-height: 2rem;
  }
  .toggle {
    display: inline-flex;
    gap: 0.35rem;
    align-items: center;
    min-height: 2rem;
  }
  .readouts {
    display: grid;
    gap: 0.2rem;
    margin: 0.5rem 0 0;
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }
  .readouts div {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }
  dt,
  dd {
    margin: 0;
  }
  .swatch {
    display: inline-block;
    width: 0.6rem;
    height: 0.6rem;
    margin-right: 0.35rem;
    border-radius: 2px;
  }
  .swatch.measured {
    background: #22c55e;
  }
  .swatch.predicted {
    background: #f59e0b;
  }
  .note {
    font-size: 0.75rem;
    opacity: 0.7;
    margin: 0.35rem 0 0;
  }
</style>
