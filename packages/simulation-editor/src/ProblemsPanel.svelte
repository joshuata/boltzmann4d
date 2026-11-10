<!-- What stops the scenario from running (EDIT-16). Problems about a shape select it when
     clicked. -->
<script lang="ts">
  import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
  import type { EditorState } from './editor.svelte';

  interface Props {
    editor: EditorState;
  }

  let { editor }: Props = $props();
</script>

{#if editor.problems.length > 0}
  <section
    class="border-destructive/50 space-y-1 rounded-md border p-2"
    aria-labelledby="problems-heading"
  >
    <h2
      id="problems-heading"
      class="text-destructive flex items-center gap-1.5 text-sm font-semibold"
    >
      <CircleAlertIcon class="size-4" aria-hidden="true" />
      {editor.problems.length === 1
        ? 'A problem to fix'
        : `${editor.problems.length} problems to fix`}
      before running
    </h2>
    <ul class="space-y-0.5 text-sm">
      {#each editor.problems as problem, i (i)}
        <li>
          {#if problem.target}
            <button
              type="button"
              class="text-destructive w-full rounded-sm text-left break-words underline-offset-2 hover:underline"
              onclick={() => editor.select([problem.target!])}
            >
              {problem.message}
            </button>
          {:else}
            <span class="text-destructive break-words">{problem.message}</span>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}
