<!-- A labelled number input with its unit and, when out of range, the problem. -->
<script lang="ts">
  import { Input } from '@boltzmann4d/ui/input';

  interface Props {
    id: string;
    label: string;
    value: number;
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
    value = $bindable(),
    unit,
    error,
    step = 'any',
    min,
    max,
    disabled = false,
  }: Props = $props();
</script>

<div class="space-y-1">
  <label for={id} class="text-sm font-medium">{label}</label>
  <div class="flex items-center gap-2">
    <Input
      {id}
      type="number"
      inputmode="decimal"
      bind:value
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
