<!-- A labelled number field with its unit and, when out of range, the problem. Controlled:
     it shows `value` and reports each valid number typed through `onValue`, so every edit
     goes through the editor's undo history. -->
<script lang="ts">
  import { Input } from '@boltzmann4d/ui/input';
  import { untrack } from 'svelte';

  interface Props {
    id: string;
    label: string;
    value: number;
    onValue: (value: number) => void;
    unit?: string;
    error?: string;
    step?: number | 'any';
    min?: number;
    max?: number;
    disabled?: boolean;
  }

  let {
    id,
    label,
    value,
    onValue,
    unit,
    error,
    step = 'any',
    min,
    max,
    disabled = false,
  }: Props = $props();

  // What's typed, kept while it isn't a number yet ("1.", "-", "") so typing isn't undone.
  let text = $state('');
  // When the value changes from elsewhere (undo, another field), show it.
  $effect(() => {
    const current = value;
    untrack(() => {
      if (text === '' || Number(text) !== current) text = String(current);
    });
  });
</script>

<div class="space-y-1">
  <label for={id} class="text-sm font-medium">{label}</label>
  <div class="flex items-center gap-2">
    <Input
      {id}
      type="number"
      inputmode="decimal"
      value={text}
      oninput={(event) => {
        text = event.currentTarget.value;
        const number = event.currentTarget.valueAsNumber;
        if (Number.isFinite(number)) onValue(number);
      }}
      onblur={() => (text = String(value))}
      {step}
      {min}
      {max}
      {disabled}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      class="tabular-nums"
    />
    <!-- Always there, so fields with and without a unit line up. -->
    <span class="text-muted-foreground w-8 shrink-0 text-sm" aria-hidden={!unit}>{unit}</span>
  </div>
  {#if error}
    <p id="{id}-error" class="text-destructive text-xs">{error}</p>
  {/if}
</div>
