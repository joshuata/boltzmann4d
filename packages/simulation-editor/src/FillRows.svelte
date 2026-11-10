<!-- What a spawn region (or, without a region, the whole arena) is filled with (EDIT-3): rows
     of a kind, a count and a temperature. -->
<script lang="ts">
  import { Button } from '@boltzmann4d/ui/button';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import XIcon from '@lucide/svelte/icons/x';
  import type { EditorState } from './editor.svelte';
  import NumberField from './NumberField.svelte';
  import { fill, fillsOf, populationOf, rowOf, setFills, type FillRow } from './scenario-ops';
  import { selectClass } from './styles';

  interface Props {
    editor: EditorState;
    /** The region's id; undefined for the whole arena. */
    region: string | undefined;
  }

  let { editor, region }: Props = $props();

  const scenario = $derived(editor.scenario);
  const fills = $derived(fillsOf(scenario, region));
  const prefix = $derived(region ?? 'arena');

  function update(index: number, change: Partial<FillRow>) {
    const rows = fills.map((p, i) =>
      i === index ? populationOf(scenario, { ...rowOf(p), ...change }, region, p) : p,
    );
    editor.edit(
      setFills(scenario, region, rows),
      `fill:${prefix}:${index}:${Object.keys(change)[0]}`,
    );
  }

  function remove(index: number) {
    editor.edit(
      setFills(
        scenario,
        region,
        fills.filter((_, i) => i !== index),
      ),
    );
  }

  function add() {
    const used = new Set(fills.map((p) => p.kind));
    const kind = scenario.kinds.find((k) => !used.has(k.id)) ?? scenario.kinds[0]!;
    editor.edit(
      setFills(scenario, region, [
        ...fills,
        fill(kind, 20, 300, scenario.arena.dimensions, region),
      ]),
    );
  }
</script>

<div class="space-y-2">
  {#each fills as population, i (i)}
    {@const row = rowOf(population)}
    <div class="bg-muted/40 space-y-2 rounded-md border p-2">
      <div class="flex items-end gap-2">
        <div class="min-w-0 flex-1 space-y-1">
          <label for="{prefix}-kind-{i}" class="text-sm font-medium">Kind</label>
          <select
            id="{prefix}-kind-{i}"
            class={selectClass}
            value={row.kind}
            onchange={(e) => update(i, { kind: e.currentTarget.value })}
          >
            {#each scenario.kinds as kind (kind.id)}
              <option value={kind.id}>{kind.name}</option>
            {/each}
          </select>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Remove this row"
          title="Remove this row"
          onclick={() => remove(i)}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <NumberField
          id="{prefix}-count-{i}"
          label="Count"
          value={row.count}
          step={1}
          min={0}
          onValue={(count) => update(i, { count: Math.max(0, Math.round(count)) })}
        />
        <NumberField
          id="{prefix}-temperature-{i}"
          label="Temperature"
          unit="K"
          value={row.temperature ?? 300}
          min={0}
          onValue={(temperature) => update(i, { temperature })}
        />
      </div>
      {#if population.particles.length > 0}
        <p class="text-muted-foreground text-xs">
          Plus {population.particles.length} particles at given positions.
        </p>
      {/if}
    </div>
  {/each}
  <Button variant="outline" size="sm" onclick={add}>
    <PlusIcon aria-hidden="true" />
    Add a kind to fill with
  </Button>
</div>
