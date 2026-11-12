<!-- The View menu: colour particles by type, speed or kinetic energy, kinds' markers and
     trace mode (VIEW-5) with its point size and Clear action. None of these restart. -->
<script lang="ts">
  import SidebarPanel from './SidebarPanel.svelte';
  import { Button } from '@boltzmann4d/ui/button';
  import { Checkbox } from '@boltzmann4d/ui/checkbox';
  import { Input } from '@boltzmann4d/ui/input';
  import { Label } from '@boltzmann4d/ui/label';
  import * as Select from '@boltzmann4d/ui/select';
  import type { ColorMode } from '@boltzmann4d/engine/sim';

  interface Props {
    colorMode: ColorMode;
    trace: boolean;
    /** Trace dot size, px (`.set` `trace_point_size`). */
    tracePointSize: number;
    /** Kinds' markers on particles (KIND-9; 2D). */
    markers: boolean;
    canMark: boolean;
    onColorMode: (mode: ColorMode) => void;
    onTrace: (enabled: boolean, pointSize?: number) => void;
    /** Erases the trace drawn so far. */
    onClearTrace: () => void;
    onMarkers: (enabled: boolean) => void;
  }

  let {
    colorMode,
    trace,
    tracePointSize,
    markers,
    canMark,
    onColorMode,
    onTrace,
    onClearTrace,
    onMarkers,
  }: Props = $props();

  const id = $props.id();

  const MODES: { value: ColorMode; label: string }[] = [
    { value: 'NORMAL', label: 'By type' },
    { value: 'SPEED', label: 'By speed' },
    { value: 'KE', label: 'By kinetic energy' },
  ];
  const POINT_SIZE = { min: 1, max: 10 };

  function setPointSize(value: number) {
    if (!Number.isFinite(value)) return;
    const size = Math.min(Math.max(Math.round(value), POINT_SIZE.min), POINT_SIZE.max);
    if (size !== tracePointSize) onTrace(trace, size);
  }
</script>

<SidebarPanel id="view" title="View">
  <div class="grid min-w-0 gap-2 text-sm">
    <div class="grid gap-1">
      <Label for="{id}-colour" class="text-xs font-normal">Colour</Label>
      <Select.Root
        type="single"
        value={colorMode}
        onValueChange={(value) => onColorMode(value as ColorMode)}
      >
        <Select.Trigger id="{id}-colour" class="w-full">
          {MODES.find((m) => m.value === colorMode)?.label}
        </Select.Trigger>
        <Select.Content>
          {#each MODES as m (m.value)}
            <Select.Item value={m.value} label={m.label} />
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
    {#if colorMode !== 'NORMAL'}
      <p class="text-muted-foreground text-xs">
        Violet to red across the {colorMode === 'KE' ? 'Kinetic energy' : 'Instantaneous speed'} plot’s
        min and max; darker beyond them.
      </p>
    {/if}
    {#if canMark}
      <div class="flex min-h-8 items-center gap-2">
        <Checkbox
          id="{id}-markers"
          checked={markers}
          onCheckedChange={(checked) => onMarkers(checked)}
        />
        <Label for="{id}-markers" class="font-normal">Kind markers</Label>
      </div>
    {/if}
    <div class="flex min-h-8 items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <Checkbox id="{id}-trace" checked={trace} onCheckedChange={(checked) => onTrace(checked)} />
        <Label for="{id}-trace" class="font-normal">Trace paths</Label>
      </div>
      {#if trace}
        <Button variant="outline" size="sm" onclick={onClearTrace}>Clear trace</Button>
      {/if}
    </div>
    {#if trace}
      <div class="flex items-center gap-2 pl-6">
        <Label for="{id}-point" class="text-xs font-normal">Dot size (px)</Label>
        <Input
          id="{id}-point"
          type="number"
          min={POINT_SIZE.min}
          max={POINT_SIZE.max}
          step="1"
          class="h-9 w-20"
          value={tracePointSize}
          onchange={(e) => setPointSize(e.currentTarget.valueAsNumber)}
        />
      </div>
    {/if}
  </div>
</SidebarPanel>
