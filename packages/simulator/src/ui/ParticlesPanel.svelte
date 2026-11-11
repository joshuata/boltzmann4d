<!-- The Particles panel (PART-1–9, 12, 15, 16): pick a kind, set its number (adding or
     removing particles while the gas runs), and its mass, radius and temperature. Edited
     values stay marked pending until they're used: temperature by the next particles added,
     mass and radius by Restart. Also the live temperature and, in a divided box, the counts
     on each side. -->
<script lang="ts">
  import { SPECIES_LIMITS } from '@boltzmann4d/engine/scenario/edit';
  import { MAX_PARTICLES } from '@boltzmann4d/engine/sim/particle-edits';
  import { Button } from '@boltzmann4d/ui/button';
  import { Input } from '@boltzmann4d/ui/input';
  import { Label } from '@boltzmann4d/ui/label';
  import MinusIcon from '@lucide/svelte/icons/minus';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import KindSwatch from './KindSwatch.svelte';
  import SidebarPanel from './SidebarPanel.svelte';
  import type { SimulationClient } from './simulation.svelte';

  interface Props {
    sim: SimulationClient;
    showMarkers: boolean;
    /** What a tap on the arena does, for the hint. */
    tap: 'drop' | 'random' | 'other';
  }

  let { sim, showMarkers, tap }: Props = $props();

  const id = $props.id();

  /** PART-4's range, K. */
  const TEMPERATURE = { min: 0, max: 9999 };

  const kind = $derived(sim.setupKinds.find((k) => k.id === sim.selectedKind) ?? null);
  const draft = $derived((kind && sim.drafts[kind.id]) || {});
  const count = $derived(kind && kind.species >= 0 ? (sim.census?.counts[kind.species] ?? 0) : 0);
  const total = $derived(sim.census?.counts.reduce((a, b) => a + b, 0) ?? sim.particleCount);
  /** The kind's temperature now, K (NaN without particles). */
  const present = $derived(
    kind && kind.species >= 0 ? (sim.census?.temperatures[kind.species] ?? NaN) : NaN,
  );
  /** What the next particles of the kind are added at, K. */
  const temperature = $derived(kind ? sim.addTemperature(kind.id) : 300);

  /** The typed number, until it's applied (Enter or leaving the field). */
  let typedCount = $state<number | null>(null);
  function applyCount() {
    if (typedCount === null) return;
    const room = MAX_PARTICLES - total + count;
    const next = Math.min(Math.max(Math.round(typedCount), 0), room);
    typedCount = null;
    if (Number.isFinite(next) && next !== count) sim.setCount(next);
  }

  /** Clamps a typed value to its range (PART-1–4); NaN clears the draft. */
  function edit(field: 'mass' | 'radius' | 'temperature', value: number, running: number) {
    if (!kind) return;
    const limits =
      field === 'temperature'
        ? TEMPERATURE
        : field === 'mass'
          ? SPECIES_LIMITS.mass
          : SPECIES_LIMITS.radius;
    const clamped = Number.isFinite(value)
      ? Math.min(Math.max(value, limits.min), limits.max)
      : NaN;
    sim.setDraft(kind.id, {
      [field]: Number.isNaN(clamped) || clamped === running ? undefined : clamped,
    });
  }

  const pendingRestart = $derived(draft.mass !== undefined || draft.radius !== undefined);
  const fmtT = (t: number | undefined) =>
    t === undefined || !Number.isFinite(t) ? '—' : `${t.toFixed(0)} K`;
  const sides = $derived(sim.census?.left && sim.census.right ? sim.census : null);
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
</script>

<SidebarPanel id="particles" title="Particles" subtitle="({total})">
  <div class="grid gap-3">
    <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kind to add or change">
      {#each sim.setupKinds as k (k.id)}
        <button
          type="button"
          role="radio"
          aria-checked={k.id === sim.selectedKind}
          class={[
            'flex min-h-9 items-center gap-1.5 rounded-md border px-2 text-xs',
            k.id === sim.selectedKind ? 'border-primary bg-accent' : 'bg-background',
          ]}
          onclick={() => (sim.selectedKind = k.id)}
        >
          <KindSwatch color={k.color} marker={k.marker} showMarker={showMarkers} />
          {k.name}
          {#if sim.drafts[k.id]}<span class="text-primary" title="Edited values pending">•</span
            >{/if}
        </button>
      {/each}
    </div>

    {#if kind}
      <div class="grid gap-1">
        <Label for="{id}-count" class="text-xs font-normal">Number of {kind.name}</Label>
        <div class="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            aria-label="Remove the newest {kind.name} particle"
            title="Remove the newest {kind.name} particle"
            disabled={sim.loading || count === 0}
            onclick={() => sim.removeParticle()}
          >
            <MinusIcon aria-hidden="true" />
          </Button>
          <Input
            id="{id}-count"
            type="number"
            min="0"
            max={MAX_PARTICLES}
            step="1"
            class="h-9 w-24"
            value={typedCount ?? count}
            disabled={sim.loading}
            oninput={(e) => (typedCount = e.currentTarget.valueAsNumber)}
            onchange={applyCount}
            onkeydown={(e) => {
              if (e.key === 'Enter') applyCount();
            }}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="Add a {kind.name} particle at random"
            title="Add a {kind.name} particle at random"
            disabled={sim.loading || total >= MAX_PARTICLES}
            onclick={() => sim.addParticle()}
          >
            <PlusIcon aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div class="grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2">
        {@render field(
          'mass',
          'Mass (amu)',
          draft.mass ?? kind.mass,
          kind.mass,
          SPECIES_LIMITS.mass,
          'any',
        )}
        {@render field(
          'radius',
          'Radius (nm)',
          draft.radius ?? kind.radius,
          kind.radius,
          SPECIES_LIMITS.radius,
          '0.1',
        )}
        {@render field(
          'temperature',
          'Temperature (K)',
          temperature,
          kind ? (sim.addTemperatures[kind.id] ?? kind.temperature) : 300,
          TEMPERATURE,
          '1',
        )}
      </div>
      {#if draft.temperature !== undefined}
        <p class="text-muted-foreground text-xs">
          {draft.temperature} K applies to the next {kind.name} particles added, or to all of them on
          Restart.
        </p>
      {/if}
      {#if pendingRestart}
        <p class="text-muted-foreground text-xs">
          New mass and radius apply on Restart; particles added before then keep the running
          {kind.mass} amu and {kind.radius} nm.
        </p>
      {/if}
      <p class="text-muted-foreground text-xs">
        {#if tap === 'drop'}
          Tap the arena to drop a {kind.name} particle there.
        {:else if tap === 'random'}
          Tap the arena to add a {kind.name} particle at random.
        {:else}
          Tapping the arena opens and closes the hole; use + to add particles.
        {/if}
      </p>
    {/if}

    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs tabular-nums">
      <dt class="text-muted-foreground">Temperature, all</dt>
      <dd>{fmtT(sim.census?.temperature)}</dd>
      {#if kind && kind.species >= 0}
        <dt class="text-muted-foreground">{kind.name} now</dt>
        <dd>{fmtT(present)}</dd>
      {/if}
      {#if sides}
        <dt class="text-muted-foreground">Left #</dt>
        <dd>{sum(sides.left!)}</dd>
        <dt class="text-muted-foreground">Right #</dt>
        <dd>{sum(sides.right!)}</dd>
      {/if}
    </dl>
    {#if sim.notice}
      <p class="text-destructive text-xs" role="status">{sim.notice}</p>
    {/if}
  </div>
</SidebarPanel>

{#snippet field(
  name: 'mass' | 'radius' | 'temperature',
  label: string,
  value: number,
  running: number,
  limits: { min: number; max: number },
  step: string,
)}
  {@const pending = (sim.drafts[kind?.id ?? ''] ?? {})[name] !== undefined}
  <div class="grid min-w-0 gap-1">
    <Label for="{id}-{name}" class="text-xs font-normal">
      {label}
      {#if pending}<span class="text-primary font-medium">pending</span>{/if}
    </Label>
    <Input
      id="{id}-{name}"
      type="number"
      min={limits.min}
      max={limits.max}
      {step}
      class={['h-9', pending && 'border-primary ring-primary/30 ring-2']}
      {value}
      aria-describedby={pending ? `${id}-${name}-pending` : undefined}
      onchange={(e) => edit(name, e.currentTarget.valueAsNumber, running)}
    />
    {#if pending}
      <span id="{id}-{name}-pending" class="sr-only">Pending: not applied yet</span>
    {/if}
  </div>
{/snippet}
