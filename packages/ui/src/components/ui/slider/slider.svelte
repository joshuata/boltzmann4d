<script lang="ts">
  import { Slider as SliderPrimitive } from 'bits-ui';
  import { cn, type WithoutChildrenOrChild } from '@boltzmann4d/ui/lib/utils.js';

  let {
    ref = $bindable(null),
    value = $bindable(),
    orientation = 'horizontal',
    class: className,
    thumbLabel,
    getValueText,
    ...restProps
  }: WithoutChildrenOrChild<SliderPrimitive.RootProps> & {
    /** Accessible name for the thumb(s), which is what screen readers announce. */
    thumbLabel?: string;
    /** Human-readable value for screen readers (e.g. for non-linear scales). */
    getValueText?: (value: number) => string;
  } = $props();
</script>

<!--
Discriminated Unions + Destructing (required for bindable) do not
get along, so we shut typescript up by casting `value` to `never`.
-->
<SliderPrimitive.Root
  bind:ref
  bind:value={value as never}
  data-slot="slider"
  {orientation}
  class={cn(
    'data-vertical:min-h-40 relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:w-auto data-vertical:flex-col',
    className,
  )}
  {...restProps}
>
  {#snippet children({ thumbItems })}
    <span
      data-slot="slider-track"
      data-orientation={orientation}
      class={cn(
        'bg-muted rounded-full data-horizontal:h-1.5 data-horizontal:w-full data-vertical:h-full data-vertical:w-1.5 relative grow overflow-hidden data-horizontal:w-full data-vertical:h-full',
      )}
    >
      <SliderPrimitive.Range
        data-slot="slider-range"
        class={cn('bg-primary absolute select-none data-horizontal:h-full data-vertical:w-full')}
      />
    </span>
    {#each thumbItems as thumb (thumb.index)}
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        index={thumb.index}
        aria-label={thumbLabel}
        aria-valuetext={getValueText?.(
          Array.isArray(value) ? (value[thumb.index] ?? 0) : (value ?? 0),
        )}
        class="border-primary ring-ring/50 size-4 rounded-full border bg-white shadow-sm transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden block shrink-0 select-none disabled:pointer-events-none disabled:opacity-50"
      />
    {/each}
  {/snippet}
</SliderPrimitive.Root>
