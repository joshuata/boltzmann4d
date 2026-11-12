<!-- The piston controls (the Java app's Piston Control Panel): a target position, how the
     piston moves there, its speed, and Move / Stop. Positions are shown as how far the
     piston is pushed in. -->
<script lang="ts">
  import { Button } from '@boltzmann4d/ui/button';
  import { Input } from '@boltzmann4d/ui/input';
  import { Label } from '@boltzmann4d/ui/label';
  import * as Select from '@boltzmann4d/ui/select';
  import { Slider } from '@boltzmann4d/ui/slider';
  import { PistonMode } from '@boltzmann4d/engine/sim/piston';
  import SidebarPanel from './SidebarPanel.svelte';
  import type { PistonInfo } from '../worker';

  interface Props {
    piston: PistonInfo & { level: number; moving: boolean };
    onMove: (level: number, mode: PistonMode, speed: number) => void;
    onStop: () => void;
  }

  let { piston, onMove, onStop }: Props = $props();

  const id = $props.id();

  const MODES: { value: PistonMode; label: string }[] = [
    { value: PistonMode.ADIABATIC, label: 'Adiabatic' },
    { value: PistonMode.ISOTHERMAL, label: 'Isothermal' },
    { value: PistonMode.INSTANTANEOUS, label: 'Instantaneous' },
  ];

  /** Slider steps of 0.1% of the arena height, as in Java (0–1000). */
  const STEPS = 1000;
  let target = $state(0);
  let mode = $state<PistonMode>(PistonMode.ADIABATIC);
  /** nm/ps (= 1000 m/s), as in Java's speed spinner. */
  let speed = $state(0.2);

  const maxStep = $derived(Math.floor(piston.maxLevel * STEPS));
  const nm = (level: number) => (level * piston.arenaHeight * 1e9).toFixed(2);
  const describe = (step: number) => `${nm(step / STEPS)} nm (${(step / 10).toFixed(1)}%)`;
  // Java only allows instantaneous moves outwards.
  const instantInwards = $derived(
    mode === PistonMode.INSTANTANEOUS && target / STEPS > piston.level,
  );
  const speedValid = $derived(Number.isFinite(speed) && speed > 0);
</script>

<SidebarPanel id="piston" title="Piston">
  <div class="grid min-w-0 gap-3 text-sm">
    <p class="text-muted-foreground text-xs tabular-nums" role="status">
      Pushed in {nm(piston.level)} nm ({(piston.level * 100).toFixed(1)}%){piston.moving
        ? ' · moving'
        : ''}
    </p>

    <div class="grid gap-1">
      <span class="text-xs tabular-nums">Target: {describe(target)}</span>
      <!-- The padding gives the thumb a bigger touch target on phones and tablets. -->
      <Slider
        type="single"
        thumbLabel="Piston target"
        class="py-2"
        min={0}
        max={maxStep}
        step={1}
        value={target}
        getValueText={describe}
        onValueChange={(step) => (target = step)}
      />
    </div>

    <div class="grid grid-cols-2 gap-2">
      <div class="grid min-w-0 gap-1">
        <Label for="{id}-mode" class="text-xs font-normal">Mode</Label>
        <Select.Root
          type="single"
          value={mode}
          onValueChange={(value) => (mode = value as PistonMode)}
        >
          <Select.Trigger id="{id}-mode" class="w-full">
            {MODES.find((m) => m.value === mode)?.label}
          </Select.Trigger>
          <Select.Content>
            {#each MODES as m (m.value)}
              <Select.Item value={m.value} label={m.label} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
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
          disabled={mode === PistonMode.INSTANTANEOUS}
          oninput={(e) => (speed = e.currentTarget.valueAsNumber)}
        />
      </div>
    </div>

    {#if instantInwards}
      <p class="text-muted-foreground text-xs">
        An instantaneous move can only pull the piston out.
      </p>
    {/if}

    <div class="grid grid-cols-2 gap-2">
      <Button
        variant="outline"
        disabled={instantInwards || !speedValid}
        onclick={() => onMove(target / STEPS, mode, speed * 1000)}
      >
        Move
      </Button>
      <Button variant="outline" disabled={!piston.moving} onclick={onStop}>Stop</Button>
    </div>
  </div>
</SidebarPanel>
