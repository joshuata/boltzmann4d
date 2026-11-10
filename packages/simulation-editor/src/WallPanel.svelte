<!-- The selected walls (EDIT-13): their kind and its settings (WALL-4) and their style
     (WALL-5). With several selected, it edits what they share. -->
<script lang="ts">
  import { WALL_KINDS, wallStyle, type Wall } from '@boltzmann4d/engine/scenario';
  import { Button } from '@boltzmann4d/ui/button';
  import { Checkbox } from '@boltzmann4d/ui/checkbox';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import type { EditorState } from './editor.svelte';
  import NumberField from './NumberField.svelte';
  import { defaultWallKind, deleteShapes, editWalls, setWallKind, wallKey } from './scenario-ops';
  import { headingClass, selectClass } from './styles';

  interface Props {
    editor: EditorState;
    ids: string[];
  }

  let { editor, ids }: Props = $props();

  const KIND_LABELS: Record<Wall['kind']['type'], string> = {
    reflecting: 'Reflecting',
    thermal: 'Thermal (held at a temperature)',
    semipermeable: 'Semipermeable (some kinds pass)',
    gate: 'Gate (opens and closes)',
    attractive: 'Attractive (a well along it)',
  };

  const scenario = $derived(editor.scenario);
  const walls = $derived(scenario.walls.filter((w) => ids.includes(w.id)));
  const first = $derived(walls[0]!);
  /** A shared kind type, or null when they differ. */
  const kindType = $derived(walls.every((w) => w.kind.type === first.kind.type) ? first.kind.type : null); // prettier-ignore
  const style = $derived(wallStyle(first.kind.type, first.style));
  const hex = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`;
  const key = $derived(ids.join(','));

  const update = (change: (wall: Wall) => void, field: string) =>
    editor.edit(editWalls(scenario, ids, change), `wall:${key}:${field}`);
</script>

<section class="space-y-3" aria-labelledby="wall-heading">
  <div class="flex items-center justify-between gap-2">
    <h2 id="wall-heading" class={headingClass}>
      {walls.length === 1 ? 'Wall' : `${walls.length} walls`}
    </h2>
    <Button
      variant="ghost"
      size="sm"
      onclick={() => editor.edit(deleteShapes(scenario, ids.map(wallKey)))}
    >
      <Trash2Icon aria-hidden="true" />
      Delete
    </Button>
  </div>

  <div class="space-y-1">
    <label for="wall-kind" class="text-sm font-medium">Kind</label>
    <select
      id="wall-kind"
      class={selectClass}
      value={kindType ?? ''}
      onchange={(e) => {
        const type = e.currentTarget.value as Wall['kind']['type'];
        editor.edit(setWallKind(scenario, ids, defaultWallKind(type, scenario)));
      }}
    >
      {#if kindType === null}<option value="" disabled>Several kinds</option>{/if}
      {#each WALL_KINDS as type (type)}
        <option value={type}>{KIND_LABELS[type]}</option>
      {/each}
    </select>
    {#if kindType === 'thermal'}
      <p class="text-muted-foreground text-xs">
        Particles leave it at the wall's temperature, so the gas near it heats or cools.
      </p>
    {:else if kindType === 'gate'}
      <p class="text-muted-foreground text-xs">
        Open and close it while the simulation runs: tap it, or use its button.
      </p>
    {:else if kindType === 'attractive'}
      <p class="text-muted-foreground text-xs">
        Particles within the well's width of the wall gain its depth in kinetic energy, and need
        that much to leave.
      </p>
    {/if}
  </div>

  {#if kindType && walls.length > 0}
    {@const kind = first.kind}
    {#if kind.type === 'thermal'}
      <NumberField
        id="wall-temperature"
        label="Temperature"
        unit="K"
        value={kind.temperature}
        onValue={(t) =>
          update((w) => {
            if (w.kind.type === 'thermal') w.kind.temperature = t;
          }, 'temperature')}
      />
    {:else if kind.type === 'semipermeable'}
      <fieldset class="space-y-1">
        <legend class="text-sm font-medium">Kinds that pass through</legend>
        {#each scenario.kinds as k (k.id)}
          <div class="flex min-h-8 items-center gap-2">
            <Checkbox
              id="wall-passes-{k.id}"
              checked={kind.passes.includes(k.id)}
              onCheckedChange={(on) =>
                update((w) => {
                  if (w.kind.type !== 'semipermeable') return;
                  w.kind.passes = on
                    ? [...new Set([...w.kind.passes, k.id])]
                    : w.kind.passes.filter((p) => p !== k.id);
                }, `passes-${k.id}`)}
            />
            <label for="wall-passes-{k.id}" class="text-sm">{k.name}</label>
          </div>
        {/each}
      </fieldset>
    {:else if kind.type === 'gate'}
      <div class="flex min-h-8 items-center gap-2">
        <Checkbox
          id="wall-open"
          checked={kind.open}
          onCheckedChange={(on) =>
            update((w) => {
              if (w.kind.type === 'gate') w.kind.open = on;
            }, 'open')}
        />
        <label for="wall-open" class="text-sm">Starts open</label>
      </div>
    {:else if kind.type === 'attractive'}
      <div class="grid grid-cols-2 gap-2">
        <NumberField
          id="wall-depth"
          label="Well depth"
          unit="kJ/mol"
          value={kind.depth}
          onValue={(depth) =>
            update((w) => {
              if (w.kind.type === 'attractive') w.kind.depth = depth;
            }, 'depth')}
        />
        <NumberField
          id="wall-width"
          label="Well width"
          unit="nm"
          value={kind.width}
          onValue={(width) =>
            update((w) => {
              if (w.kind.type === 'attractive') w.kind.width = width;
            }, 'width')}
        />
      </div>
    {/if}
  {/if}

  <fieldset class="space-y-2">
    <legend class="text-sm font-medium">Style</legend>
    <div class="grid grid-cols-[auto_1fr] items-end gap-2">
      <div class="space-y-1">
        <label for="wall-color" class="text-xs">Colour</label>
        <input
          id="wall-color"
          type="color"
          class="block h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
          value={hex(style.color)}
          oninput={(e) => {
            const color = e.currentTarget.value.toUpperCase();
            update((w) => (w.style = { ...w.style, color }), 'color');
          }}
        />
      </div>
      <div class="space-y-1">
        <label for="wall-dash" class="text-xs">Line</label>
        <select
          id="wall-dash"
          class={selectClass}
          value={style.dash}
          onchange={(e) => {
            const dash = e.currentTarget.value as 'solid' | 'dashed';
            update((w) => (w.style = { ...w.style, dash }), 'dash');
          }}
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
        </select>
      </div>
    </div>
    <NumberField
      id="wall-line-width"
      label="Line width"
      unit="px"
      value={style.lineWidth}
      min={1}
      onValue={(lineWidth) =>
        update((w) => (w.style = { ...w.style, lineWidth: Math.max(1, lineWidth) }), 'lineWidth')}
    />
    {#if walls.some((w) => Object.keys(w.style).length > 0)}
      <Button
        variant="outline"
        size="sm"
        onclick={() => update((w) => (w.style = {}), 'reset-style')}
      >
        Use the kind's style
      </Button>
    {/if}
  </fieldset>

  {#if walls.length === 1 && first.points.length >= 3}
    <div class="flex min-h-8 items-center gap-2">
      <Checkbox
        id="wall-closed"
        checked={first.closed}
        onCheckedChange={(on) => update((w) => (w.closed = on), 'closed')}
      />
      <label for="wall-closed" class="text-sm">Closed (join the last point to the first)</label>
    </div>
  {/if}
  {#if walls.length === 1}
    <p class="text-muted-foreground text-xs">
      {first.points.length} points. Drag a point's handle to move it; arrow keys move the wall.
    </p>
  {/if}
</section>
