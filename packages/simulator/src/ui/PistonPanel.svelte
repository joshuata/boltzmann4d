<!-- The piston (SIM-19–23, OPT-6, PRED-15): where it is, as the gas's volume; a target
     volume and how to get there (adiabatic, isothermal or instantaneous); the live
     temperature beside the prediction; whether the isothermal thermostat is acting; and
     the piston's speed and the thermostat's damping. Volumes are fractions of the arena's
     volume with the piston all the way out (V₀). -->
<script lang="ts">
  import { Button } from '@boltzmann4d/ui/button';
  import { Input } from '@boltzmann4d/ui/input';
  import { Label } from '@boltzmann4d/ui/label';
  import * as Select from '@boltzmann4d/ui/select';
  import { Slider } from '@boltzmann4d/ui/slider';
  import { PistonMode } from '@boltzmann4d/engine/sim/piston';
  import { DEFAULT_DAMP_FACTOR } from '@boltzmann4d/engine/sim/thermostat';
  import { adiabaticTemperature } from '@boltzmann4d/engine/stats/formulas';
  import SidebarPanel from './SidebarPanel.svelte';
  import type { PistonState } from './simulation.svelte';

  interface Props {
    piston: PistonState;
    /** The whole gas's temperature now, K (from the census; undefined until the first). */
    temperature: number | undefined;
    dimension: number;
    disabled?: boolean;
    onMove: (level: number, mode: PistonMode, speed: number, dampFactor: number) => void;
    onStop: () => void;
  }

  let { piston, temperature, dimension, disabled = false, onMove, onStop }: Props = $props();

  const id = $props.id();

  const MODES: { value: PistonMode; label: string }[] = [
    { value: PistonMode.ADIABATIC, label: 'Adiabatic' },
    { value: PistonMode.ISOTHERMAL, label: 'Isothermal' },
    { value: PistonMode.INSTANTANEOUS, label: 'Instantaneous' },
  ];
  const modeLabel = (mode: PistonMode | null) => MODES.find((m) => m.value === mode)?.label ?? '';

  /** Slider steps of 0.1% of V₀, as Java's 0–1000 level slider. */
  const STEPS = 1000;
  /** Target volume in steps (1000 = V₀, piston out). */
  let target = $state(STEPS);
  let mode = $state<PistonMode>(PistonMode.ADIABATIC);
  /** nm/ps (= 1000 m/s), as in Java's speed spinner (SIM-22). */
  let speed = $state(0.2);
  /** The thermostat's damping, % (OPT-6). */
  let damping = $state(DEFAULT_DAMP_FACTOR * 100);

  const minStep = $derived(Math.ceil((1 - piston.maxLevel) * STEPS));
  const level = $derived(piston.level);
  /** V/V₀ now. */
  const volume = $derived(1 - level);
  const targetLevel = $derived(Math.min(1 - target / STEPS, piston.maxLevel));
  const nm = (fraction: number) => (fraction * piston.arenaHeight * 1e9).toFixed(1);
  const percent = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;
  const describe = (step: number) => `${percent(step / STEPS)} of V₀ (${nm(step / STEPS)} nm high)`;
  const fmtT = (t: number | undefined) =>
    t !== undefined && Number.isFinite(t) ? `${t.toFixed(1)} K` : '—';

  // Java only allows instantaneous moves outwards.
  const instantInwards = $derived(mode === PistonMode.INSTANTANEOUS && targetLevel > level);
  const speedValid = $derived(Number.isFinite(speed) && speed > 0);
  const dampingValid = $derived(Number.isFinite(damping) && damping >= 0 && damping <= 100);

  // PRED-15: from the state when this run of moves began. Adiabatic: T₁ (V₁/V)^{2/d};
  // isothermal or instantaneous (free expansion): T₁. Before any move, the picked mode's.
  const reference = $derived(piston.reference);
  const predictionMode = $derived(reference.mode ?? mode);
  const predicted = $derived(
    predictionMode === PistonMode.ADIABATIC
      ? adiabaticTemperature(reference.temperature, 1 - reference.level, volume, dimension)
      : reference.temperature,
  );
  const exponent = $derived(dimension === 3 ? '2/3' : dimension === 2 ? '' : '2');
</script>

<SidebarPanel id="piston" title="Piston" subtitle={`V ${percent(volume)}`}>
  {#snippet actions()}
    {#if piston.thermostatActive}
      <span
        class="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs whitespace-nowrap"
        role="status"
      >
        Thermostat active
      </span>
    {/if}
  {/snippet}
  <div class="grid min-w-0 gap-3 text-sm">
    <!-- SIM-23: the piston's position as the gas's volume, with the target marked. -->
    <div class="grid gap-1">
      <div
        class="bg-muted relative h-3 overflow-hidden rounded-sm"
        role="meter"
        aria-label="Gas volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(volume * 1000) / 10}
        aria-valuetext={`${percent(volume)} of V₀${piston.moving ? ', moving' : ''}`}
      >
        <div class="bg-primary/70 h-full" style:width={percent(volume)}></div>
        <div
          class="bg-foreground absolute inset-y-0 w-0.5"
          style:left={`calc(${percent(target / STEPS)} - 1px)`}
          aria-hidden="true"
        ></div>
      </div>
      <p class="text-muted-foreground text-xs tabular-nums">
        Volume {percent(volume)} of V₀ · {nm(volume)} nm high{piston.moving ? ' · moving' : ''}
      </p>
    </div>

    <div class="grid gap-1">
      <span class="text-xs tabular-nums">Target: {describe(target)}</span>
      <!-- The padding gives the thumb a bigger touch target on phones and tablets. -->
      <Slider
        type="single"
        thumbLabel="Target volume"
        class="py-2"
        min={minStep}
        max={STEPS}
        step={1}
        value={target}
        {disabled}
        getValueText={describe}
        onValueChange={(step) => (target = step)}
      />
    </div>

    <div class="grid min-w-0 gap-1">
      <Label for="{id}-mode" class="text-xs font-normal">Mode</Label>
      <Select.Root
        type="single"
        value={mode}
        onValueChange={(value) => (mode = value as PistonMode)}
      >
        <Select.Trigger id="{id}-mode" class="w-full">{modeLabel(mode)}</Select.Trigger>
        <Select.Content>
          {#each MODES as m (m.value)}
            <Select.Item value={m.value} label={m.label} />
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    {#if instantInwards}
      <p class="text-muted-foreground text-xs">
        An instantaneous move can only pull the piston out.
      </p>
    {/if}

    <div class="grid grid-cols-2 gap-2">
      <Button
        variant="outline"
        disabled={disabled || instantInwards || !speedValid || !dampingValid}
        onclick={() => onMove(targetLevel, mode, speed * 1000, damping / 100)}
      >
        Move Piston
      </Button>
      <Button variant="outline" disabled={disabled || !piston.moving} onclick={onStop}>Stop</Button>
    </div>

    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs tabular-nums">
      <dt class="text-muted-foreground">Temperature now</dt>
      <dd>{fmtT(temperature)}</dd>
      <dt class="text-muted-foreground">Predicted ({modeLabel(predictionMode).toLowerCase()})</dt>
      <dd>{fmtT(predicted)}</dd>
      <dt class="text-muted-foreground">From</dt>
      <dd>{fmtT(reference.temperature)} at {percent(1 - reference.level)} of V₀</dd>
    </dl>
    <p class="text-muted-foreground text-xs">
      {#if predictionMode === PistonMode.ADIABATIC}
        Adiabatic: T = T₁ (V₁/V){#if exponent}<sup>{exponent}</sup>{/if}, for a slow piston.
      {:else if predictionMode === PistonMode.ISOTHERMAL}
        Isothermal: the walls hold T = T₁, so PV stays constant.
      {:else}
        Free expansion: no work is done, so T stays at T₁.
      {/if}
    </p>

    <div class="grid grid-cols-2 gap-2">
      <div class="grid min-w-0 gap-1">
        <Label for="{id}-speed" class="text-xs font-normal">Speed (nm/ps)</Label>
        <Input
          id="{id}-speed"
          type="number"
          min="0.01"
          max="10"
          step="0.05"
          class="h-9"
          value={speed}
          disabled={disabled || mode === PistonMode.INSTANTANEOUS}
          oninput={(e) => (speed = e.currentTarget.valueAsNumber)}
        />
      </div>
      <div class="grid min-w-0 gap-1">
        <Label for="{id}-damping" class="text-xs font-normal">Thermostat damping (%)</Label>
        <Input
          id="{id}-damping"
          type="number"
          min="0"
          max="100"
          step="5"
          class="h-9"
          value={damping}
          disabled={disabled || mode !== PistonMode.ISOTHERMAL}
          oninput={(e) => (damping = e.currentTarget.valueAsNumber)}
        />
      </div>
    </div>
  </div>
</SidebarPanel>
