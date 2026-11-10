<!-- With nothing selected (EDIT-13): the arena (dimensions, size, walls, divider, hole,
     demon), how the run starts, the colours, and what fills the whole arena. -->
<script lang="ts">
  import { ARENA_SIZE_LIMITS, PALETTES, type Scenario } from '@boltzmann4d/engine/scenario';
  import { Button } from '@boltzmann4d/ui/button';
  import { Checkbox } from '@boltzmann4d/ui/checkbox';
  import type { EditorState } from './editor.svelte';
  import FillRows from './FillRows.svelte';
  import NumberField from './NumberField.svelte';
  import { headingClass, selectClass } from './styles';

  interface Props {
    editor: EditorState;
  }

  let { editor }: Props = $props();

  type Boundary = Scenario['arena']['boundary'];
  const BOUNDARY_LABELS: Record<Boundary, string> = {
    PERIODIC: 'Periodic (no walls)',
    REFLECTING: 'Box with walls',
    DIVIDED: 'Divided box',
    HOLE: 'Divided box with a hole',
    PISTON: 'Box with a movable piston',
  };

  const scenario = $derived(editor.scenario);
  const arena = $derived(scenario.arena);
  /** A hole needs 2D or 3D (SIM-15); drawn walls rule out periodic and piston (WALL-3). */
  const boundaries = $derived(
    (Object.keys(BOUNDARY_LABELS) as Boundary[]).filter(
      (b) =>
        !(arena.dimensions === 1 && b === 'HOLE') &&
        !(scenario.walls.length > 0 && (b === 'PERIODIC' || b === 'PISTON')),
    ),
  );

  function change(mutate: (s: Scenario) => void, key: string) {
    const next = structuredClone(scenario);
    mutate(next);
    editor.edit(next, key);
  }

  const sizeError = (v: number) =>
    v >= ARENA_SIZE_LIMITS.min && v <= ARENA_SIZE_LIMITS.max
      ? undefined
      : `Between ${ARENA_SIZE_LIMITS.min} and ${ARENA_SIZE_LIMITS.max} nm`;
  const AXES = ['Width', 'Height', 'Depth'] as const;
</script>

<section class="space-y-3" aria-labelledby="arena-heading">
  <h2 id="arena-heading" class={headingClass}>Arena</h2>
  <div class="space-y-1">
    <span class="text-sm font-medium" id="dimensions-label">Dimensions</span>
    <div class="flex gap-2" role="radiogroup" aria-labelledby="dimensions-label">
      {#each [1, 2, 3] as const as d (d)}
        <Button
          variant={arena.dimensions === d ? 'default' : 'outline'}
          size="sm"
          role="radio"
          aria-checked={arena.dimensions === d}
          onclick={() =>
            change((s) => {
              s.arena.dimensions = d;
              if (d === 1 && s.arena.boundary === 'HOLE') s.arena.boundary = 'DIVIDED';
            }, 'dimensions')}
        >
          {d}D
        </Button>
      {/each}
    </div>
  </div>
  <div class={['grid gap-2', arena.dimensions === 3 ? 'grid-cols-3' : 'grid-cols-2']}>
    {#each AXES.slice(0, arena.dimensions) as axis, i (axis)}
      <NumberField
        id="arena-size-{i}"
        label={axis}
        unit="nm"
        value={arena.size[i]!}
        error={sizeError(arena.size[i]!)}
        onValue={(v) => change((s) => (s.arena.size[i] = v), `size-${i}`)}
      />
    {/each}
  </div>
  <div class="space-y-1">
    <label for="arena-boundary" class="text-sm font-medium">Walls</label>
    <select
      id="arena-boundary"
      class={selectClass}
      value={arena.boundary}
      onchange={(e) =>
        change((s) => {
          s.arena.boundary = e.currentTarget.value as Boundary;
          if (s.arena.boundary !== 'HOLE') s.modes.maxwellDemon = false;
        }, 'boundary')}
    >
      {#each boundaries as b (b)}
        <option value={b}>{BOUNDARY_LABELS[b]}</option>
      {/each}
    </select>
  </div>
  {#if arena.boundary === 'HOLE'}
    <NumberField
      id="arena-hole"
      label="Hole diameter"
      unit="nm"
      value={arena.holeSize}
      onValue={(v) => change((s) => (s.arena.holeSize = v), 'hole')}
    />
    <div class="flex min-h-8 items-center gap-2">
      <Checkbox
        id="arena-demon"
        checked={scenario.modes.maxwellDemon}
        onCheckedChange={(on) => change((s) => (s.modes.maxwellDemon = on), 'demon')}
      />
      <label for="arena-demon" class="text-sm">Maxwell's demon (the hole starts closed)</label>
    </div>
  {/if}
  {#if arena.boundary === 'DIVIDED' || arena.boundary === 'HOLE'}
    <div class="flex min-h-8 items-center gap-2">
      <Checkbox
        id="arena-conducting"
        checked={arena.dividerThermalMode === 'CONDUCTING'}
        onCheckedChange={(on) =>
          change((s) => (s.arena.dividerThermalMode = on ? 'CONDUCTING' : 'INSULATING'), 'conduct')}
      />
      <label for="arena-conducting" class="text-sm">Divider conducts heat</label>
    </div>
  {/if}
</section>

<section class="space-y-2" aria-labelledby="arena-fill-heading">
  <h2 id="arena-fill-heading" class={headingClass}>Whole-arena fill</h2>
  <p class="text-muted-foreground text-xs">
    Placed anywhere in the arena{arena.boundary === 'DIVIDED'
      ? ' (the first kind left of the divider, the others right)'
      : ''}. Draw a spawn region to place particles in one area.
  </p>
  <FillRows {editor} region={undefined} />
</section>

<section class="space-y-2" aria-labelledby="run-heading">
  <h2 id="run-heading" class={headingClass}>Running and colours</h2>
  <div class="flex min-h-8 items-center gap-2">
    <Checkbox
      id="run-paused"
      checked={scenario.run.paused}
      onCheckedChange={(on) => change((s) => (s.run.paused = on), 'paused')}
    />
    <label for="run-paused" class="text-sm">Start paused</label>
  </div>
  <div class="space-y-1">
    <label for="palette" class="text-sm font-medium">Colour palette</label>
    <select
      id="palette"
      class={selectClass}
      value={scenario.display.palette}
      onchange={(e) =>
        change(
          (s) => (s.display.palette = e.currentTarget.value as Scenario['display']['palette']),
          'palette',
        )}
    >
      {#each Object.entries(PALETTES) as [id, palette] (id)}
        <option value={id} disabled={palette.colors.length < scenario.kinds.length}>
          {palette.label}{palette.colorBlindSafe ? '' : ' (not colour-blind safe)'}
        </option>
      {/each}
    </select>
  </div>
  <div class="flex min-h-8 items-center gap-2">
    <Checkbox
      id="markers"
      checked={scenario.display.markers}
      onCheckedChange={(on) => change((s) => (s.display.markers = on), 'markers')}
    />
    <label for="markers" class="text-sm">Draw each kind's marker on its particles</label>
  </div>
</section>
