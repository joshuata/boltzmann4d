<!-- The pressure readout (PRES-1–8): measured pressure per kind and in total, for the arena
     or for each side of a divided one, next to the Ideal or Real prediction; marked while
     the first averaging time is still filling. The averaging time is set here too (OPT-3). -->
<script lang="ts">
  import { Button } from '@boltzmann4d/ui/button';
  import { Input } from '@boltzmann4d/ui/input';
  import { Label } from '@boltzmann4d/ui/label';
  import type { PressureReading } from '@boltzmann4d/engine/stats/pressure';
  import type { KindInfo } from '../worker';
  import KindSwatch from './KindSwatch.svelte';

  interface Props {
    reading: PressureReading;
    kinds: KindInfo[];
    prediction: 'IDEAL' | 'REAL';
    /** Seconds. */
    averagingTime: number;
    showMarkers: boolean;
    /** Drawn walls aren't measured or allowed for in the predictions. */
    drawnWalls: boolean;
    onPrediction: (prediction: 'IDEAL' | 'REAL') => void;
    onAveragingTime: (seconds: number) => void;
  }

  let {
    reading,
    kinds,
    prediction,
    averagingTime,
    showMarkers,
    drawnWalls,
    onPrediction,
    onAveragingTime,
  }: Props = $props();

  const PREDICTIONS = [
    { value: 'IDEAL', label: 'Ideal', title: 'Ideal gas: P V = N k T, ignoring particle size' },
    { value: 'REAL', label: 'Real', title: 'Hard spheres: corrected for particle size' },
  ] as const;
  const REGION_NAMES = { arena: 'Arena', left: 'Left side', right: 'Right side' } as const;

  /** The averaging time field, ps. */
  let averagingPs = $derived(Math.round(averagingTime * 1e12 * 1000) / 1000);
  const commitAveraging = () => {
    if (Number.isFinite(averagingPs) && averagingPs > 0) onAveragingTime(averagingPs * 1e-12);
    else averagingPs = Math.round(averagingTime * 1e12 * 1000) / 1000;
  };
  const averagingId = $props.id();

  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const fmt = (value: number) =>
    Number.isFinite(value)
      ? value.toLocaleString('en-US', { maximumSignificantDigits: 3, minimumSignificantDigits: 3 })
      : '—';
  const predicted = (region: PressureReading['regions'][number]) =>
    prediction === 'REAL' ? region.real : region.ideal;
  const ps = (seconds: number) => (seconds * 1e12).toFixed(0);
  /** The kinds a region has or had particles of (the others have nothing to show). */
  const kindsIn = (region: PressureReading['regions'][number]) =>
    kinds
      .map((kind, k) => ({ ...kind, k }))
      .filter(({ k }) => region.ideal[k]! > 0 || region.measured[k]! > 0);
</script>

<section class="mt-4 border-t pt-3" aria-label="Pressure">
  <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
    <h2 class="text-sm font-semibold">
      {reading.method === 'virial' ? 'Virial pressure' : 'Wall pressure'}
      <span class="text-muted-foreground font-normal">({reading.unit})</span>
    </h2>
    <div class="flex gap-1" role="group" aria-label="Pressure prediction">
      {#each PREDICTIONS as option (option.value)}
        <Button
          variant={prediction === option.value ? 'secondary' : 'ghost'}
          size="sm"
          class="min-w-14"
          aria-pressed={prediction === option.value}
          title={option.title}
          onclick={() => onPrediction(option.value)}
        >
          {option.label}
        </Button>
      {/each}
    </div>
  </div>

  {#if reading.warmingUp}
    <p class="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs" role="status">
      <span class="size-2 shrink-0 animate-pulse rounded-full bg-amber-500" aria-hidden="true"
      ></span>
      Warming up: averaged over {ps(reading.covered)} of {ps(reading.averagingTime)} ps so far
    </p>
  {/if}

  <div class="grid gap-3">
    {#each reading.regions as region (region.region)}
      {@const expected = predicted(region)}
      {@const shown = kindsIn(region)}
      <table class="w-full text-xs tabular-nums">
        <caption class="sr-only">{REGION_NAMES[region.region]} pressure</caption>
        <thead>
          <tr class="text-muted-foreground">
            <th scope="col" class="py-0.5 text-left font-medium">
              {reading.regions.length > 1 ? REGION_NAMES[region.region] : 'Kind'}
            </th>
            <th scope="col" class="py-0.5 text-right font-medium">Measured</th>
            <th scope="col" class="py-0.5 text-right font-medium">
              {prediction === 'REAL' ? 'Real' : 'Ideal'}
            </th>
          </tr>
        </thead>
        <tbody>
          {#each shown as kind (kind.k)}
            <tr class={shown.length === 1 ? 'font-medium' : ''}>
              <th scope="row" class={['py-0.5 text-left', shown.length > 1 && 'font-normal']}>
                <span class="flex min-w-0 items-center gap-1.5">
                  <KindSwatch
                    color={kind.color}
                    marker={kind.marker}
                    showMarker={showMarkers}
                    size={12}
                  />
                  <span class="truncate">{kind.name}</span>
                </span>
              </th>
              <td class="py-0.5 text-right">{fmt(region.measured[kind.k]!)}</td>
              <td class="text-muted-foreground py-0.5 text-right">{fmt(expected[kind.k]!)}</td>
            </tr>
          {/each}
          {#if shown.length !== 1}
            <tr class="border-t font-medium">
              <th scope="row" class="py-0.5 text-left">Total</th>
              <td class="py-0.5 text-right">{fmt(sum(region.measured))}</td>
              <td class="text-muted-foreground py-0.5 text-right">{fmt(sum(expected))}</td>
            </tr>
          {/if}
        </tbody>
      </table>
    {/each}
  </div>

  <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
    <Label for={averagingId} class="text-xs font-normal">Averaging time (ps)</Label>
    <Input
      id={averagingId}
      type="number"
      min="1"
      max="100000"
      step="10"
      class="h-8 w-24 text-xs"
      bind:value={averagingPs}
      onchange={commitAveraging}
    />
  </div>
  {#if reading.method === 'virial'}
    <p class="text-muted-foreground mt-2 text-xs">
      Periodic boundaries have no walls: this is the virial pressure over every collision since the
      start.
    </p>
  {:else if drawnWalls}
    <p class="text-muted-foreground mt-2 text-xs">
      Measured on the box’s left and right walls; drawn walls aren’t counted or allowed for in the
      predictions.
    </p>
  {/if}
</section>
