<!-- One collapsible area of the sidebar (STAT-25): a card whose heading is a toggle button with
     a chevron, so each area folds away by mouse, touch (the whole heading row is the target)
     or keyboard (Tab to it, Enter or Space). Whether it is open is remembered per browser under
     `id`, when storage is available. -->
<script lang="ts">
  import * as Collapsible from '@boltzmann4d/ui/collapsible';
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
  import type { Snippet } from 'svelte';
  import { untrack } from 'svelte';

  interface Props {
    /** Names the area in the heading, and in its remembered open state (`boltzmann4d.panel.<id>`). */
    id: string;
    /** The heading text. */
    title: string;
    /** Muted text after the title, e.g. a unit or a short live summary. */
    subtitle?: string;
    /** Open the first time (before the reader has toggled it). Defaults to open. */
    defaultOpen?: boolean;
    /** Whether the area is open; bind to it to follow or set it from outside. */
    open?: boolean;
    /** Controls shown in the heading row beside the toggle, visible even when collapsed. */
    actions?: Snippet;
    children: Snippet;
  }

  let {
    id,
    title,
    subtitle,
    defaultOpen = true,
    open = $bindable(),
    actions,
    children,
  }: Props = $props();

  const storageKey = untrack(() => `boltzmann4d.panel.${id}`);

  function stored(): boolean | undefined {
    try {
      const value = localStorage.getItem(storageKey);
      return value === null ? undefined : value === 'open';
    } catch {
      return undefined;
    }
  }

  if (open === undefined) open = stored() ?? untrack(() => defaultOpen);

  function remember(value: boolean) {
    try {
      localStorage.setItem(storageKey, value ? 'open' : 'closed');
    } catch {
      // Private windows and blocked storage: the panel just forgets.
    }
  }

  const headingId = $props.id();
</script>

<Collapsible.Root
  bind:open={() => open ?? false, (value) => ((open = value), remember(value))}
  class="bg-background/60 mb-3 min-w-0 rounded-md border text-sm"
>
  <section aria-labelledby={headingId}>
    <div class="flex min-h-10 items-center gap-2 pr-2">
      <h2 class="min-w-0 flex-1">
        <Collapsible.Trigger
          id={headingId}
          class="hover:bg-muted/60 focus-visible:ring-ring/50 flex min-h-10 w-full items-center gap-2 rounded-md py-1.5 pl-3 text-left font-semibold outline-none focus-visible:ring-[3px]"
        >
          <ChevronDownIcon
            class={['size-4 shrink-0 transition-transform', !open && '-rotate-90']}
            aria-hidden="true"
          />
          <span class="min-w-0">
            {title}
            {#if subtitle}<span class="text-muted-foreground font-normal">{subtitle}</span>{/if}
          </span>
        </Collapsible.Trigger>
      </h2>
      {@render actions?.()}
    </div>
    <Collapsible.Content class="min-w-0 px-3 pt-1 pb-3">
      {@render children()}
    </Collapsible.Content>
  </section>
</Collapsible.Root>
