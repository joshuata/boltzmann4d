<!-- Which of the simulator's sidebar panels students see (EDIT-24). Hidden panels are saved in
     the scenario's `sidebar.hidden`. -->
<script lang="ts">
  import { SIDEBAR_PANELS, type Scenario, type SidebarPanelId } from '@boltzmann4d/engine/scenario';
  import { Checkbox } from '@boltzmann4d/ui/checkbox';
  import type { EditorState } from './editor.svelte';
  import { headingClass } from './styles';

  interface Props {
    editor: EditorState;
  }

  let { editor }: Props = $props();

  const hidden = $derived(new Set(editor.scenario.sidebar.hidden));

  function setShown(id: SidebarPanelId, shown: boolean) {
    const next: Scenario = structuredClone(editor.scenario);
    // Kept in the sidebar's order, so files don't change with the order of clicks.
    next.sidebar.hidden = SIDEBAR_PANELS.map((p) => p.id).filter((p) =>
      p === id ? !shown : hidden.has(p),
    );
    editor.edit(next);
  }
</script>

<section class="space-y-2" aria-labelledby="sidebar-heading">
  <h2 id="sidebar-heading" class={headingClass}>Sidebar</h2>
  <p class="text-muted-foreground text-xs">
    The panels students see beside the simulation. Run always shows; unticked panels are hidden.
  </p>
  <div class="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-1">
    {#each SIDEBAR_PANELS as panel (panel.id)}
      <div class="flex min-h-8 items-center gap-2">
        <Checkbox
          id="sidebar-{panel.id}"
          checked={!hidden.has(panel.id)}
          onCheckedChange={(on) => setShown(panel.id, on)}
        />
        <label for="sidebar-{panel.id}" class="text-sm">
          {panel.label}
          {#if 'when' in panel}<span class="text-muted-foreground">({panel.when})</span>{/if}
        </label>
      </div>
    {/each}
  </div>
</section>
