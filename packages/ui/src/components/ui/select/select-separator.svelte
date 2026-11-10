<script lang="ts">
  import { Separator } from '@boltzmann4d/ui/components/ui/separator/index.js';
  import { cn } from '@boltzmann4d/ui/lib/utils.js';
  import type { Separator as SeparatorPrimitive } from 'bits-ui';

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: SeparatorPrimitive.RootProps = $props();
</script>

<Separator
  bind:ref
  data-slot="select-separator"
  class={cn('bg-border -mx-1 my-1 h-px pointer-events-none', className)}
  {...restProps}
/>
