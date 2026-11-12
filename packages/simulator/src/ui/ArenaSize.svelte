<!-- The arena's size in nm (OPT-1, SIM-10): width and height, and depth in 3D. Applying a
     new size restarts the simulation with the particles placed anew. Part of the Arena
     panel. -->
<script lang="ts">
  import { ARENA_SIZE_LIMITS } from '@boltzmann4d/engine/scenario/edit';
  import { Button } from '@boltzmann4d/ui/button';
  import { Input } from '@boltzmann4d/ui/input';
  import { Label } from '@boltzmann4d/ui/label';

  interface Props {
    /** x, y, z in nm, as running. */
    size: [number, number, number];
    dimension: number;
    disabled?: boolean;
    onChange: (size: [number, number, number]) => void;
  }

  let { size, dimension, disabled = false, onChange }: Props = $props();

  /** The fields, reset to the running size whenever that changes. */
  let draft = $derived<[number, number, number]>([...size]);
  const setAxis = (axis: number, value: number) => {
    const next: [number, number, number] = [...draft];
    next[axis] = value;
    draft = next;
  };
  const axes = $derived((['Width', 'Height', 'Depth'] as const).slice(0, dimension === 3 ? 3 : 2));
  const valid = $derived(
    axes.every(
      (_, axis) =>
        Number.isFinite(draft[axis]) &&
        draft[axis]! >= ARENA_SIZE_LIMITS.min &&
        draft[axis]! <= ARENA_SIZE_LIMITS.max,
    ),
  );
  const changed = $derived(axes.some((_, axis) => draft[axis] !== size[axis]));
  const id = $props.id();
</script>

<form
  class="grid gap-1"
  aria-labelledby="{id}-label"
  onsubmit={(e) => {
    e.preventDefault();
    if (valid && changed) onChange([...draft]);
  }}
>
  <p class="text-sm font-medium" id="{id}-label">Size (nm)</p>
  <div class="grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] items-end gap-2">
    {#each axes as axis, i (axis)}
      <div class="grid min-w-0 gap-1">
        <Label for="{id}-{i}" class="text-xs font-normal">{axis}</Label>
        <Input
          id="{id}-{i}"
          type="number"
          min={ARENA_SIZE_LIMITS.min}
          max={ARENA_SIZE_LIMITS.max}
          step="1"
          class="h-9"
          value={draft[i]}
          oninput={(e) => setAxis(i, e.currentTarget.valueAsNumber)}
          {disabled}
        />
      </div>
    {/each}
    <Button type="submit" variant="outline" disabled={disabled || !valid || !changed}>Apply</Button>
  </div>
  {#if changed}
    <p class="text-muted-foreground text-xs">Applying restarts with the particles placed anew.</p>
  {/if}
</form>
