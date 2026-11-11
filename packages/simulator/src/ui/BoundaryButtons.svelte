<!-- Boundary modes (SIM-12–16): periodic, box, divided box, divided box with a hole. Opening
     a divided box's hole or removing its divider carries on with the running gas; switching
     to the divided box restarts with every particle on the left. -->
<script lang="ts">
  import type { ArenaInfo, BoundaryMode } from '../worker';

  interface Props {
    boundary: ArenaInfo['boundary'];
    /** Drawn walls need box walls (WALL-3), so no periodic boundaries. */
    drawnWalls: boolean;
    disabled?: boolean;
    onChange: (boundary: BoundaryMode) => void;
  }

  let { boundary, drawnWalls, disabled = false, onChange }: Props = $props();

  const MODES: { mode: BoundaryMode; label: string; title: string }[] = [
    { mode: 'PERIODIC', label: 'Periodic', title: 'Periodic boundaries: no walls (SIM-12)' },
    { mode: 'REFLECTING', label: 'Box', title: 'Box with walls (SIM-13)' },
    {
      mode: 'DIVIDED',
      label: 'Divided',
      title: 'Divided box: restarts with every particle on the left (SIM-14)',
    },
    { mode: 'HOLE', label: 'Hole', title: 'Divided box with a hole (SIM-15)' },
  ];
  // A piston arena is a box with a piston (Arena options).
  const current = $derived(boundary === 'PISTON' ? 'REFLECTING' : boundary);
  const id = $props.id();
</script>

<div class="mb-3 grid gap-1 text-sm">
  <p class="text-sm font-medium" id="{id}-label">Boundaries</p>
  <div class="grid grid-cols-4 gap-1" role="radiogroup" aria-labelledby="{id}-label">
    {#each MODES as { mode, label, title } (mode)}
      <button
        type="button"
        role="radio"
        aria-checked={current === mode}
        {title}
        disabled={disabled || (mode === 'PERIODIC' && drawnWalls)}
        class={[
          'min-h-9 rounded-md border px-1 text-xs font-medium disabled:opacity-50',
          current === mode
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-background hover:bg-accent',
        ]}
        onclick={() => current !== mode && onChange(mode)}
      >
        {label}
      </button>
    {/each}
  </div>
  {#if current === 'DIVIDED'}
    <p class="text-muted-foreground text-xs">
      Hole or Box keeps the gas running, so the two sides can mix.
    </p>
  {/if}
</div>
