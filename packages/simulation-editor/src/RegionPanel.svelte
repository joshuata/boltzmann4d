<!-- A selected spawn region (EDIT-3, EDIT-13): its name and what it's filled with. -->
<script lang="ts">
  import { Button } from '@boltzmann4d/ui/button';
  import { Input } from '@boltzmann4d/ui/input';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import type { EditorState } from './editor.svelte';
  import FillRows from './FillRows.svelte';
  import { deleteShapes, regionKey } from './scenario-ops';
  import { headingClass } from './styles';

  interface Props {
    editor: EditorState;
    id: string;
  }

  let { editor, id }: Props = $props();

  const scenario = $derived(editor.scenario);
  const region = $derived(scenario.spawnRegions.find((r) => r.id === id));
</script>

{#if region}
  <section class="space-y-3" aria-labelledby="region-heading">
    <div class="flex items-center justify-between gap-2">
      <h2 id="region-heading" class={headingClass}>Spawn region</h2>
      <Button
        variant="ghost"
        size="sm"
        onclick={() => editor.edit(deleteShapes(scenario, [regionKey(id)]))}
      >
        <Trash2Icon aria-hidden="true" />
        Delete
      </Button>
    </div>
    <div class="space-y-1">
      <label for="region-name" class="text-sm font-medium">Name</label>
      <Input
        id="region-name"
        value={region.name ?? ''}
        maxlength={40}
        autocomplete="off"
        oninput={(e) => {
          const name = e.currentTarget.value;
          const next = structuredClone(scenario);
          const target = next.spawnRegions.find((r) => r.id === id)!;
          if (name.trim()) target.name = name;
          else delete target.name;
          editor.edit(next, `region-name:${id}`);
        }}
      />
    </div>
    <p class="text-muted-foreground text-xs">
      Particles start inside it at random, clear of walls and each other, then move anywhere the
      walls allow.
    </p>
    <FillRows {editor} region={id} />
  </section>
{/if}
