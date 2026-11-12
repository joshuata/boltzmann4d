<!-- The Arena panel: the boundary mode (SIM-12–16), the options a boundary takes (a movable
     piston in a box, a divider that conducts heat, Maxwell's demon at the hole) and the
     arena's size. The options and the size restart the simulation when changed. -->
<script lang="ts">
  import { Checkbox } from '@boltzmann4d/ui/checkbox';
  import { Label } from '@boltzmann4d/ui/label';
  import ArenaSize from './ArenaSize.svelte';
  import BoundaryButtons from './BoundaryButtons.svelte';
  import SidebarPanel from './SidebarPanel.svelte';
  import type { ArenaInfo, ArenaOptions, BoundaryMode } from '../worker';

  interface Props {
    arena: ArenaInfo;
    dimension: number;
    disabled?: boolean;
    onBoundary: (boundary: BoundaryMode) => void;
    onChange: (options: ArenaOptions) => void;
  }

  let { arena, dimension, disabled = false, onBoundary, onChange }: Props = $props();

  const id = $props.id();
</script>

<SidebarPanel id="arena" title="Arena">
  <div class="grid min-w-0 gap-3 text-sm">
    <BoundaryButtons
      boundary={arena.boundary}
      drawnWalls={arena.drawnWalls}
      {disabled}
      onChange={onBoundary}
    />
    {#if arena.canHavePiston || arena.canConduct || arena.canDemon}
      <div class="grid gap-0.5">
        {#if arena.canHavePiston}
          {@render toggle('piston', 'Movable piston', arena.options.piston ?? false, (on) =>
            onChange({ piston: on }),
          )}
        {/if}
        {#if arena.canConduct}
          {@render toggle(
            'conducting',
            'Divider conducts heat',
            arena.options.conductingDivider ?? false,
            (on) => onChange({ conductingDivider: on }),
          )}
        {/if}
        {#if arena.canDemon}
          {@render toggle(
            'demon',
            'Maxwell’s demon (you open the hole)',
            arena.options.demon ?? false,
            (on) => onChange({ demon: on }),
          )}
        {/if}
      </div>
    {/if}
    <ArenaSize size={arena.size} {dimension} {disabled} onChange={(size) => onChange({ size })} />
  </div>
</SidebarPanel>

{#snippet toggle(name: string, label: string, checked: boolean, set: (on: boolean) => void)}
  <div class="flex min-h-8 items-center gap-2">
    <Checkbox id="{id}-{name}" {checked} {disabled} onCheckedChange={set} />
    <Label for="{id}-{name}" class="font-normal">{label}</Label>
  </div>
{/snippet}
