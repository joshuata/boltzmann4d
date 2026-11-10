<!-- Reaction rules (EDIT-14, KIND-13–15): A + B → C + D with forward and reverse activation
     energies. Conflicting rules are reported by validation (KIND-14). -->
<script lang="ts">
  import { DEFAULT_REACTION, type Reaction, type Scenario } from '@boltzmann4d/engine/scenario';
  import { Button } from '@boltzmann4d/ui/button';
  import { Checkbox } from '@boltzmann4d/ui/checkbox';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import XIcon from '@lucide/svelte/icons/x';
  import type { EditorState } from './editor.svelte';
  import NumberField from './NumberField.svelte';
  import { headingClass, selectClass } from './styles';

  interface Props {
    editor: EditorState;
  }

  let { editor }: Props = $props();

  const scenario = $derived(editor.scenario);
  const kindName = (id: string) => scenario.kinds.find((k) => k.id === id)?.name ?? id;

  function change(index: number, mutate: (rule: Reaction) => void, field: string) {
    const next: Scenario = structuredClone(scenario);
    mutate(next.reactions[index]!);
    editor.edit(next, `reaction:${index}:${field}`);
  }

  function add() {
    const [a, b] = scenario.kinds;
    const next: Scenario = structuredClone(scenario);
    next.reactions.push({
      reactants: [a!.id, a!.id],
      products: [(b ?? a)!.id, (b ?? a)!.id],
      ...DEFAULT_REACTION,
      suppressReverse: false,
      enabled: true,
    });
    editor.edit(next);
  }

  function remove(index: number) {
    const next: Scenario = structuredClone(scenario);
    next.reactions.splice(index, 1);
    editor.edit(next);
  }

  /** KIND-13: reacting particles keep their mass and radius, so different values mislead. */
  function sizeWarning(rule: Reaction): string | null {
    const kind = (id: string) => scenario.kinds.find((k) => k.id === id);
    const differs = rule.products.some((p, i) => {
      const from = kind(rule.reactants[i]!);
      const to = kind(p);
      return from && to && (from.mass !== to.mass || from.radius !== to.radius);
    });
    return differs
      ? "Particles that react keep their own mass and radius; the products' values only apply to particles that start as them."
      : null;
  }
</script>

{#snippet kindSelect(id: string, value: string, label: string, onPick: (kind: string) => void)}
  <select
    {id}
    class={[selectClass, 'w-auto']}
    aria-label={label}
    {value}
    onchange={(e) => onPick(e.currentTarget.value)}
  >
    {#each scenario.kinds as kind (kind.id)}
      <option value={kind.id}>{kind.name}</option>
    {/each}
  </select>
{/snippet}

<section class="space-y-2" aria-labelledby="reactions-heading">
  <h2 id="reactions-heading" class={headingClass}>Reactions</h2>
  {#if scenario.reactions.length === 0}
    <p class="text-muted-foreground text-xs">
      None. A rule turns two colliding particles into two others when they hit hard enough.
    </p>
  {/if}
  {#each scenario.reactions as rule, i (i)}
    {@const warning = sizeWarning(rule)}
    <div class="bg-muted/40 space-y-2 rounded-md border p-2">
      <div class="flex flex-wrap items-center gap-1 text-sm">
        {@render kindSelect(`rule-${i}-r0`, rule.reactants[0], 'First reactant', (k) =>
          change(i, (r) => (r.reactants[0] = k), 'r0'),
        )}
        +
        {@render kindSelect(`rule-${i}-r1`, rule.reactants[1], 'Second reactant', (k) =>
          change(i, (r) => (r.reactants[1] = k), 'r1'),
        )}
        →
        {@render kindSelect(`rule-${i}-p0`, rule.products[0], 'First product', (k) =>
          change(i, (r) => (r.products[0] = k), 'p0'),
        )}
        +
        {@render kindSelect(`rule-${i}-p1`, rule.products[1], 'Second product', (k) =>
          change(i, (r) => (r.products[1] = k), 'p1'),
        )}
        <Button
          variant="ghost"
          size="icon"
          class="ml-auto"
          aria-label="Remove reaction {i + 1}"
          title="Remove this reaction"
          onclick={() => remove(i)}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <NumberField
          id="rule-{i}-forward"
          label="Forward energy"
          unit="kJ/mol"
          value={rule.forward}
          min={0}
          onValue={(v) => change(i, (r) => (r.forward = v), 'forward')}
        />
        <NumberField
          id="rule-{i}-reverse"
          label="Reverse energy"
          unit="kJ/mol"
          value={rule.reverse}
          min={0}
          onValue={(v) => change(i, (r) => (r.reverse = v), 'reverse')}
        />
      </div>
      <div class="flex flex-wrap gap-x-4">
        <div class="flex min-h-8 items-center gap-2">
          <Checkbox
            id="rule-{i}-suppress"
            checked={rule.suppressReverse}
            onCheckedChange={(on) => change(i, (r) => (r.suppressReverse = on), 'suppress')}
          />
          <label for="rule-{i}-suppress" class="text-sm">
            No reverse ({kindName(rule.products[0])} + {kindName(rule.products[1])} stay)
          </label>
        </div>
        <div class="flex min-h-8 items-center gap-2">
          <Checkbox
            id="rule-{i}-enabled"
            checked={rule.enabled}
            onCheckedChange={(on) => change(i, (r) => (r.enabled = on), 'enabled')}
          />
          <label for="rule-{i}-enabled" class="text-sm">On</label>
        </div>
      </div>
      {#if warning}<p class="text-xs text-amber-700 dark:text-amber-400">{warning}</p>{/if}
    </div>
  {/each}
  <Button variant="outline" size="sm" onclick={add}>
    <PlusIcon aria-hidden="true" />
    Add a reaction
  </Button>
</section>
