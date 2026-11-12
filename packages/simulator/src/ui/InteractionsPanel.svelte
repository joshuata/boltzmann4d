<!-- Wells and reactions (the Java app's Energy Wells and Reactions tabs), in non-periodic
     2D arenas: attractive square wells between particles, an attractive bottom wall, and
     red ⇌ blue reactions. Switching one on or off restarts the simulation at once; its
     numeric settings restart it on Apply. -->
<script lang="ts">
  import { Button } from '@boltzmann4d/ui/button';
  import { Checkbox } from '@boltzmann4d/ui/checkbox';
  import { Input } from '@boltzmann4d/ui/input';
  import { Label } from '@boltzmann4d/ui/label';
  import type { Snippet } from 'svelte';
  import SidebarPanel from './SidebarPanel.svelte';
  import type { ArenaInfo, ArenaOptions } from '../worker';

  interface Props {
    arena: ArenaInfo;
    disabled?: boolean;
    onChange: (options: ArenaOptions) => void;
  }

  let { arena, disabled = false, onChange }: Props = $props();

  const id = $props.id();

  // Java's defaults: radius 3 × contact distance, 1 kJ/mol per species.
  const DEFAULT_MULTIPLIER = 3.0;
  const DEFAULT_DEPTH = 1.0;
  let multiplier = $state(DEFAULT_MULTIPLIER);
  let depths = $state<number[]>([]);
  $effect.pre(() => {
    // Start from what's running (or the defaults) whenever a preset loads.
    multiplier = arena.options.wells?.radiusMultiplier ?? DEFAULT_MULTIPLIER;
    depths = arena.typeNames.map((_, t) => arena.options.wells?.depths[t] ?? DEFAULT_DEPTH);
  });
  const wellsOn = $derived(Boolean(arena.options.wells));
  const valid = $derived(multiplier > 1 && depths.every((d) => Number.isFinite(d) && d >= 0));
  const changed = $derived(
    !arena.options.wells ||
      arena.options.wells.radiusMultiplier !== multiplier ||
      arena.options.wells.depths.some((d, t) => d !== depths[t]),
  );
  const applyWells = () =>
    onChange({ wells: { radiusMultiplier: multiplier, depths: [...depths] } });

  // The attractive wall: Java's defaults, 10 nm wide and 2.5 kJ/mol deep.
  let wallWidth = $state(10);
  let wallDepth = $state(2.5);
  $effect.pre(() => {
    wallWidth = (arena.options.attractiveWall?.width ?? 10e-9) * 1e9;
    wallDepth = arena.options.attractiveWall?.depth ?? 2.5;
  });
  const wallOn = $derived(Boolean(arena.options.attractiveWall));
  const wallValid = $derived(wallWidth > 0 && wallDepth >= 0);
  const wallChanged = $derived(
    !arena.options.attractiveWall ||
      arena.options.attractiveWall.width !== wallWidth * 1e-9 ||
      arena.options.attractiveWall.depth !== wallDepth,
  );
  const applyWall = () =>
    onChange({ attractiveWall: { width: wallWidth * 1e-9, depth: wallDepth } });

  // Reactions: Java's defaults, forward 8 and reverse 4 kJ/mol.
  let forward = $state(8);
  let reverse = $state(4);
  let suppressReverse = $state(false);
  $effect.pre(() => {
    forward = arena.options.reactions?.forward ?? 8;
    reverse = arena.options.reactions?.reverse ?? 4;
    suppressReverse = arena.options.reactions?.suppressReverse ?? false;
  });
  const reactionsOn = $derived(Boolean(arena.options.reactions));
  const reactionsValid = $derived(forward >= 0 && reverse >= 0);
  const reactionsChanged = $derived(
    !arena.options.reactions ||
      arena.options.reactions.forward !== forward ||
      arena.options.reactions.reverse !== reverse ||
      arena.options.reactions.suppressReverse !== suppressReverse,
  );
  const applyReactions = () => onChange({ reactions: { forward, reverse, suppressReverse } });
</script>

{#if arena.canHaveWells || arena.canReact}
  <SidebarPanel id="interactions" title="Wells and reactions">
    <div class="grid min-w-0 gap-1.5 text-sm">
      {#if arena.canHaveWells}
        {@render toggle('wells', 'Attractive wells', wellsOn, (on) =>
          on ? applyWells() : onChange({ wells: null }),
        )}
        {#if wellsOn}
          {#snippet wellFields()}
            {@render number(
              'wells-radius',
              'Radius (× contact)',
              multiplier,
              1.05,
              10,
              0.1,
              (v) => {
                multiplier = v;
              },
            )}
            {#each arena.typeNames as name, t (t)}
              {@render number(
                `wells-depth-${t}`,
                `${name} depth (kJ/mol)`,
                depths[t] ?? DEFAULT_DEPTH,
                0,
                50,
                0.5,
                (v) => {
                  depths[t] = v;
                },
              )}
            {/each}
          {/snippet}
          {@render group(wellFields, !valid || !changed, applyWells)}
        {/if}
        {@render toggle('wall', 'Attractive bottom wall', wallOn, (on) =>
          on ? applyWall() : onChange({ attractiveWall: null }),
        )}
        {#if wallOn}
          {#snippet wallFields()}
            {@render number('wall-width', 'Width (nm)', wallWidth, 0.5, 100, 0.5, (v) => {
              wallWidth = v;
            })}
            {@render number('wall-depth', 'Depth (kJ/mol)', wallDepth, 0, 50, 0.5, (v) => {
              wallDepth = v;
            })}
          {/snippet}
          {@render group(wallFields, !wallValid || !wallChanged, applyWall)}
        {/if}
      {/if}
      {#if arena.canReact}
        {@render toggle(
          'reactions',
          `Reactions (${arena.typeNames[0]} ⇌ ${arena.typeNames[1] ?? 'Reacted'})`,
          reactionsOn,
          (on) => (on ? applyReactions() : onChange({ reactions: null })),
        )}
        {#if reactionsOn}
          {#snippet reactionFields()}
            {@render number('forward', 'Forward (kJ/mol)', forward, 0, 50, 0.5, (v) => {
              forward = v;
            })}
            {@render number('reverse', 'Reverse (kJ/mol)', reverse, 0, 50, 0.5, (v) => {
              reverse = v;
            })}
            <div class="flex min-h-9 items-center gap-2 self-end">
              <Checkbox
                id="{id}-suppress"
                checked={suppressReverse}
                {disabled}
                onCheckedChange={(checked) => (suppressReverse = checked)}
              />
              <Label for="{id}-suppress" class="text-xs font-normal">No reverse</Label>
            </div>
          {/snippet}
          {@render group(reactionFields, !reactionsValid || !reactionsChanged, applyReactions)}
        {/if}
      {/if}
    </div>
  </SidebarPanel>
{/if}

{#snippet toggle(name: string, label: string, checked: boolean, set: (on: boolean) => void)}
  <div class="flex min-h-8 items-center gap-2">
    <Checkbox id="{id}-{name}" {checked} {disabled} onCheckedChange={set} />
    <Label for="{id}-{name}" class="font-normal">{label}</Label>
  </div>
{/snippet}

<!-- A switched-on option's numeric settings, applied (restarting) together. -->
{#snippet group(fields: Snippet, unchanged: boolean, apply: () => void)}
  <div class="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2 pb-1 pl-6">
    {@render fields()}
    <Button variant="outline" class="self-end" disabled={disabled || unchanged} onclick={apply}>
      Apply
    </Button>
  </div>
{/snippet}

{#snippet number(
  name: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  set: (value: number) => void,
)}
  <div class="grid min-w-0 gap-1">
    <Label for="{id}-{name}" class="text-xs font-normal">{label}</Label>
    <Input
      id="{id}-{name}"
      type="number"
      {min}
      {max}
      {step}
      class="h-9"
      {value}
      {disabled}
      oninput={(e) => set(e.currentTarget.valueAsNumber)}
    />
  </div>
{/snippet}
