<!-- The canvas's tools (EDIT-10), snapping (EDIT-11) and undo/redo (EDIT-15). Each button
     names its keyboard shortcut (EDIT-21). Stays visible at narrow widths, scrolling sideways
     if it must (EDIT-23). -->
<script lang="ts">
  import { Button } from '@boltzmann4d/ui/button';
  import LassoIcon from '@lucide/svelte/icons/lasso';
  import MagnetIcon from '@lucide/svelte/icons/magnet';
  import MousePointer2Icon from '@lucide/svelte/icons/mouse-pointer-2';
  import PentagonIcon from '@lucide/svelte/icons/pentagon';
  import Redo2Icon from '@lucide/svelte/icons/redo-2';
  import SlashIcon from '@lucide/svelte/icons/slash';
  import SquareIcon from '@lucide/svelte/icons/square';
  import SquareDashedIcon from '@lucide/svelte/icons/square-dashed';
  import Undo2Icon from '@lucide/svelte/icons/undo-2';
  import type { Component } from 'svelte';
  import type { EditorState, Tool } from './editor.svelte';

  interface Props {
    editor: EditorState;
  }

  let { editor }: Props = $props();

  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = mac ? '⌘' : 'Ctrl+';

  const TOOLS: { tool: Tool; label: string; key: string; icon: Component }[] = [
    { tool: 'select', label: 'Select and move', key: 'V', icon: MousePointer2Icon },
    { tool: 'segment', label: 'Wall: line segment', key: 'L', icon: SlashIcon },
    { tool: 'rectangle', label: 'Wall: rectangle', key: 'R', icon: SquareIcon },
    { tool: 'polygon', label: 'Wall: polygon', key: 'P', icon: PentagonIcon },
    { tool: 'region-rectangle', label: 'Spawn region: rectangle', key: 'S', icon: SquareDashedIcon }, // prettier-ignore
    { tool: 'region-polygon', label: 'Spawn region: polygon', key: 'G', icon: LassoIcon },
  ];
</script>

<div
  class="bg-background flex items-center gap-1 overflow-x-auto border-b p-1.5"
  role="toolbar"
  aria-label="Drawing tools"
>
  <div class="flex gap-1" role="radiogroup" aria-label="Tool">
    {#each TOOLS as t (t.tool)}
      <Button
        variant={editor.tool === t.tool ? 'default' : 'ghost'}
        size="icon"
        role="radio"
        aria-checked={editor.tool === t.tool}
        aria-label="{t.label} ({t.key})"
        title="{t.label} ({t.key})"
        disabled={editor.scenario.arena.dimensions !== 2 && t.tool !== 'select'}
        onclick={() => (editor.tool = t.tool)}
      >
        <t.icon aria-hidden="true" />
      </Button>
    {/each}
  </div>
  <div class="bg-border mx-1 h-6 w-px shrink-0" aria-hidden="true"></div>
  <Button
    variant={editor.snapping ? 'secondary' : 'ghost'}
    size="icon"
    aria-pressed={editor.snapping}
    aria-label="Snap to the grid, points and 15° angles (hold Alt to turn off)"
    title="Snap to the grid, points and 15° angles (hold Alt to turn off)"
    onclick={() => (editor.snapping = !editor.snapping)}
  >
    <MagnetIcon aria-hidden="true" />
  </Button>
  <div class="bg-border mx-1 h-6 w-px shrink-0" aria-hidden="true"></div>
  <Button
    variant="ghost"
    size="icon"
    disabled={!editor.canUndo}
    aria-label="Undo ({mod}Z)"
    title="Undo ({mod}Z)"
    onclick={() => editor.undo()}
  >
    <Undo2Icon aria-hidden="true" />
  </Button>
  <Button
    variant="ghost"
    size="icon"
    disabled={!editor.canRedo}
    aria-label="Redo ({mod}⇧Z)"
    title="Redo ({mod}⇧Z)"
    onclick={() => editor.redo()}
  >
    <Redo2Icon aria-hidden="true" />
  </Button>
</div>
