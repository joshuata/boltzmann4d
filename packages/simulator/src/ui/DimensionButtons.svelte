<!-- The Dimension control (SIM-7): 1D, 2D or 3D. Changing it restarts with every particle
     placed anew at its kind's temperature. Part of the Arena panel. -->
<script lang="ts">
  interface Props {
    dimension: number;
    disabled?: boolean;
    onChange: (dimension: 1 | 2 | 3) => void;
  }

  let { dimension, disabled = false, onChange }: Props = $props();

  const DIMENSIONS = [
    { value: 1, title: '1D: particles on a line (SIM-8); restarts' },
    { value: 2, title: '2D: discs in a box; restarts' },
    { value: 3, title: '3D: spheres in a box; restarts' },
  ] as const;
  const id = $props.id();
</script>

<div class="grid gap-1 text-sm">
  <p class="text-sm font-medium" id="{id}-label">Dimension</p>
  <div class="grid grid-cols-3 gap-1" role="radiogroup" aria-labelledby="{id}-label">
    {#each DIMENSIONS as { value, title } (value)}
      <button
        type="button"
        role="radio"
        aria-checked={dimension === value}
        {title}
        {disabled}
        class={[
          'min-h-9 rounded-md border px-1 text-xs font-medium disabled:opacity-50',
          dimension === value
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-background hover:bg-accent',
        ]}
        onclick={() => dimension !== value && onChange(value)}
      >
        {value}D
      </button>
    {/each}
  </div>
</div>
