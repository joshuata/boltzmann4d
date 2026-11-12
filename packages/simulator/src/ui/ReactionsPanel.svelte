<!-- The reaction readout (SIM-27, SIM-28): each kind's count now and averaged over time, the
     predicted equilibrium (PRED-12), the time it took to reach a count (STORY-27) and, for
     the sidebar's A ⇌ B reaction, the energy diagram to change it. -->
<script lang="ts">
  import { Button } from '@boltzmann4d/ui/button';
  import { Checkbox } from '@boltzmann4d/ui/checkbox';
  import { Input } from '@boltzmann4d/ui/input';
  import { Label } from '@boltzmann4d/ui/label';
  import type { ReactionReading } from '@boltzmann4d/engine/stats/reaction-meter';
  import type { KindInfo } from '../worker';
  import EnergyDiagram from './EnergyDiagram.svelte';
  import KindSwatch from './KindSwatch.svelte';
  import SidebarPanel from './SidebarPanel.svelte';

  type Rule = { forward: number; reverse: number; suppressReverse: boolean };

  interface Props {
    reading: ReactionReading | null;
    kinds: KindInfo[];
    showMarkers: boolean;
    /** The sidebar's A ⇌ B reaction, when it can be edited here (null otherwise). */
    rule: Rule | null;
    disabled?: boolean;
    onResetAverage: () => void;
    /** Applies a changed rule (the simulation starts over). */
    onRule: (rule: Rule) => void;
  }

  let {
    reading,
    kinds,
    showMarkers,
    rule,
    disabled = false,
    onResetAverage,
    onRule,
  }: Props = $props();

  const ids = $props.id();
  const sig = (value: number, digits = 3) =>
    Number.isFinite(value)
      ? value.toLocaleString('en-US', { maximumSignificantDigits: digits })
      : '—';
  const oneDecimal = (value: number) =>
    Number.isFinite(value)
      ? value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : '—';
  /** A time in ps, or ns once it's long. */
  const ps = (seconds: number) =>
    seconds >= 1e-8 ? `${sig(seconds * 1e9)} ns` : `${sig(seconds * 1e12)} ps`;

  // The rule being edited, until applied.
  let forward = $derived(rule?.forward ?? 8);
  let reverse = $derived(rule?.reverse ?? 4);
  let suppressReverse = $derived(rule?.suppressReverse ?? false);
  const ruleValid = $derived(
    Number.isFinite(forward) && Number.isFinite(reverse) && forward >= 0 && reverse >= 0,
  );
  const ruleChanged = $derived(
    !!rule &&
      (rule.forward !== forward ||
        rule.reverse !== reverse ||
        rule.suppressReverse !== suppressReverse),
  );

  // Time to N particles of a kind (STORY-27): the product by default.
  const defaultKind = $derived(reading?.prediction?.product ?? Math.max(0, kinds.length - 1));
  let chosenKind = $state<number | null>(null);
  const targetKind = $derived(
    chosenKind !== null && chosenKind < kinds.length ? chosenKind : defaultKind,
  );
  let target = $state(10);
  const reachedAt = $derived.by(() => {
    const times = reading?.firstReached[targetKind];
    if (!times || !(target >= 0)) return null;
    const n = Math.round(target);
    // Counts it had from the start share the first entry's time.
    return n < times.length ? { time: times[n]!, atStart: times[n] === times[0] } : null;
  });
  const selectClass =
    'border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 min-w-0 rounded-md border bg-transparent px-2 text-base shadow-xs outline-none focus-visible:ring-3 md:text-sm';
</script>

<SidebarPanel id="reactions" title="Reactions">
  {#if reading}
    <table class="w-full text-xs tabular-nums">
      <caption class="sr-only">Particles of each kind</caption>
      <thead>
        <tr class="text-muted-foreground">
          <th scope="col" class="py-0.5 text-left font-medium">Kind</th>
          <th scope="col" class="py-0.5 text-right font-medium">Now</th>
          <th scope="col" class="py-0.5 text-right font-medium">Average ± width</th>
        </tr>
      </thead>
      <tbody>
        {#each kinds as kind, k (k)}
          <tr>
            <th scope="row" class="py-0.5 text-left font-normal">
              <span class="flex min-w-0 items-center gap-1.5">
                <KindSwatch color={kind.color} marker={kind.marker} showMarker={showMarkers} />
                <span class="truncate">{kind.name}</span>
              </span>
            </th>
            <td class="py-0.5 text-right font-medium">{reading.counts[k] ?? 0}</td>
            <td class="py-0.5 text-right">
              {oneDecimal(reading.averages[k] ?? NaN)} ± {oneDecimal(reading.widths[k] ?? NaN)}
            </td>
          </tr>
        {/each}
        {#if reading.prediction}
          {@const p = reading.prediction}
          <tr class="border-t">
            <th scope="row" class="py-1 text-left font-normal">
              Predicted {kinds[p.product]?.name ?? 'product'}
            </th>
            <td></td>
            <td class="py-1 text-right font-medium">
              {oneDecimal(p.average)} ± {oneDecimal(p.width)}
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
    {#if !reading.prediction && reading.noPrediction}
      <p class="text-muted-foreground mt-1 text-xs">
        No equilibrium prediction: {reading.noPrediction}
      </p>
    {/if}
    <div class="mt-2 flex items-center justify-between gap-2 text-xs">
      <span class="text-muted-foreground">
        Averaged over {ps(Math.max(0, reading.time - reading.averagingSince))}
      </span>
      <Button
        variant="outline"
        size="sm"
        title="Start the averages again from now, e.g. once the counts have settled"
        onclick={onResetAverage}
      >
        Reset average
      </Button>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <Label for="{ids}-target" class="text-xs">Time to reach</Label>
      <Input
        id="{ids}-target"
        type="number"
        min="0"
        step="1"
        class="h-8 w-16"
        bind:value={target}
      />
      <Label for="{ids}-kind" class="sr-only">Kind</Label>
      <select
        id="{ids}-kind"
        class={selectClass}
        value={targetKind}
        onchange={(e) => (chosenKind = Number(e.currentTarget.value))}
      >
        {#each kinds as kind, k (k)}
          <option value={k}>{kind.name}</option>
        {/each}
      </select>
      <output class="ms-auto font-medium tabular-nums" for="{ids}-target {ids}-kind">
        {#if !reachedAt}
          not yet
        {:else if reachedAt.atStart}
          from the start
        {:else}
          {ps(reachedAt.time)}
        {/if}
      </output>
    </div>
  {:else}
    <p class="text-muted-foreground text-xs">Waiting for the first readout…</p>
  {/if}

  {#if rule}
    <div class="mt-3 grid gap-2 border-t pt-3">
      <EnergyDiagram
        {forward}
        {reverse}
        reactant={kinds[0]?.name ?? 'Reactant'}
        product={kinds[1]?.name ?? 'Product'}
        {disabled}
        onChange={(f, r) => {
          forward = f;
          reverse = r;
        }}
      />
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="grid gap-1">
          <Label for="{ids}-forward" class="text-xs">Forward (kJ/mol)</Label>
          <Input
            id="{ids}-forward"
            type="number"
            min="0"
            max="100"
            step="0.5"
            class="h-8"
            bind:value={forward}
            {disabled}
          />
        </div>
        <div class="grid gap-1">
          <Label for="{ids}-reverse" class="text-xs">Reverse (kJ/mol)</Label>
          <Input
            id="{ids}-reverse"
            type="number"
            min="0"
            max="100"
            step="0.5"
            class="h-8"
            bind:value={reverse}
            {disabled}
          />
        </div>
      </div>
      <div class="flex min-h-8 items-center gap-2">
        <Checkbox
          id="{ids}-suppress"
          checked={suppressReverse}
          {disabled}
          onCheckedChange={(checked) => (suppressReverse = checked)}
        />
        <Label for="{ids}-suppress" class="text-xs">Suppress the reverse reaction</Label>
      </div>
      <div class="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled || !ruleChanged}
          onclick={() => {
            forward = rule.forward;
            reverse = rule.reverse;
            suppressReverse = rule.suppressReverse;
          }}
        >
          Undo
        </Button>
        <Button
          size="sm"
          disabled={disabled || !ruleValid || !ruleChanged}
          title="Apply the new energies: the simulation starts over"
          onclick={() => onRule({ forward, reverse, suppressReverse })}
        >
          Apply
        </Button>
      </div>
    </div>
  {/if}
</SidebarPanel>
