<!-- The particle kinds (EDIT-14, KIND-1–3, KIND-10): name, mass, radius and colour; add up to
     ten, remove those nothing uses. -->
<script lang="ts">
  import {
    findColorProblems,
    MARKERS,
    paletteColor,
    SPECIES_LIMITS,
    type Kind,
    type Scenario,
  } from '@boltzmann4d/engine/scenario';
  import { Button } from '@boltzmann4d/ui/button';
  import { Input } from '@boltzmann4d/ui/input';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import XIcon from '@lucide/svelte/icons/x';
  import type { EditorState } from './editor.svelte';
  import NumberField from './NumberField.svelte';
  import { addKind, MAX_KINDS, removeKind } from './scenario-ops';
  import { headingClass } from './styles';

  interface Props {
    editor: EditorState;
  }

  let { editor }: Props = $props();

  const scenario = $derived(editor.scenario);
  /** Why the last removal was refused (KIND-3). */
  let refusal = $state<{ id: string; reasons: string[] } | null>(null);

  const hex = (rgb: number) => `#${rgb.toString(16).padStart(6, '0').toUpperCase()}`;
  const colorOf = (kind: Kind, index: number) =>
    kind.color ?? hex(paletteColor(scenario.display.palette, index) ?? 0xffffff);

  /** KIND-10: overridden colours that are hard to tell apart, said per kind. */
  const warnings = $derived.by(() => {
    const colors = scenario.kinds.map((k, i) => parseInt(colorOf(k, i).slice(1), 16));
    const byKind: Record<string, string[]> = {};
    for (const problem of findColorProblems(colors)) {
      const [i, j] = problem.indices;
      const involved = j === undefined ? [i] : [i, j];
      // Only warn about colours the user chose; palettes are checked by tests (KIND-8).
      const chosen = involved.filter((k) => scenario.kinds[k]!.color !== undefined);
      if (chosen.length === 0) continue;
      const what =
        j === undefined
          ? `the ${problem.background === 0 ? 'black' : 'white'} background`
          : scenario.kinds[chosen[0] === i ? j : i]!.name;
      for (const k of chosen) {
        const id = scenario.kinds[k]!.id;
        byKind[id] = [...(byKind[id] ?? []), what];
      }
    }
    return byKind;
  });

  function change(id: string, mutate: (kind: Kind) => void, field: string) {
    const next: Scenario = structuredClone(scenario);
    mutate(next.kinds.find((k) => k.id === id)!);
    editor.edit(next, `kind:${id}:${field}`);
  }

  function remove(id: string) {
    const result = removeKind(scenario, id);
    if ('refused' in result) {
      refusal = { id, reasons: result.refused };
      editor.announcement = `Can't remove: used by ${result.refused.join(', ')}`;
    } else {
      refusal = null;
      editor.edit(result.scenario);
    }
  }

  const range = (v: number, limits: { min: number; max: number }, unit: string) =>
    v >= limits.min && v <= limits.max ? undefined : `${limits.min}–${limits.max} ${unit}`;
</script>

<section class="space-y-2" aria-labelledby="kinds-heading">
  <h2 id="kinds-heading" class={headingClass}>Particle kinds</h2>
  {#each scenario.kinds as kind, i (kind.id)}
    <div class="bg-muted/40 space-y-2 rounded-md border p-2">
      <div class="flex items-end gap-2">
        <div class="space-y-1">
          <label for="kind-color-{kind.id}" class="text-xs">Colour</label>
          <input
            id="kind-color-{kind.id}"
            type="color"
            class="block h-9 w-11 cursor-pointer rounded-md border bg-transparent p-1"
            value={colorOf(kind, i)}
            oninput={(e) => {
              const color = e.currentTarget.value.toUpperCase();
              change(kind.id, (k) => (k.color = color), 'color');
            }}
          />
        </div>
        <div class="min-w-0 flex-1 space-y-1">
          <label for="kind-name-{kind.id}" class="text-xs">Name ({MARKERS[i]} marker)</label>
          <Input
            id="kind-name-{kind.id}"
            value={kind.name}
            maxlength={20}
            autocomplete="off"
            oninput={(e) => {
              const name = e.currentTarget.value;
              change(kind.id, (k) => (k.name = name), 'name');
            }}
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Remove {kind.name}"
          title="Remove {kind.name}"
          onclick={() => remove(kind.id)}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <NumberField
          id="kind-mass-{kind.id}"
          label="Mass"
          unit="amu"
          value={kind.mass}
          error={range(kind.mass, SPECIES_LIMITS.mass, 'amu')}
          onValue={(mass) => change(kind.id, (k) => (k.mass = mass), 'mass')}
        />
        <NumberField
          id="kind-radius-{kind.id}"
          label="Radius"
          unit="nm"
          value={kind.radius}
          error={range(kind.radius, SPECIES_LIMITS.radius, 'nm')}
          onValue={(radius) => change(kind.id, (k) => (k.radius = radius), 'radius')}
        />
      </div>
      {#if kind.color !== undefined}
        <div class="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onclick={() => change(kind.id, (k) => delete k.color, 'color-reset')}
          >
            Use the palette's colour
          </Button>
          {#if warnings[kind.id]}
            <p class="text-xs text-amber-700 dark:text-amber-400">
              Hard to tell apart from {warnings[kind.id]!.join(' and ')} for some viewers.
            </p>
          {/if}
        </div>
      {/if}
      {#if refusal?.id === kind.id}
        <p class="text-destructive text-xs" role="alert">
          Can't remove {kind.name}: used by {refusal.reasons.join(', ')}.
        </p>
      {/if}
    </div>
  {/each}
  <Button
    variant="outline"
    size="sm"
    disabled={scenario.kinds.length >= MAX_KINDS}
    onclick={() => editor.edit(addKind(scenario))}
  >
    <PlusIcon aria-hidden="true" />
    Add a kind
  </Button>
</section>
