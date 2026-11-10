<!-- Runs a scenario file from the user's computer (FILE-1): Boltzmann 4D JSON or a
     Boltzmann 3D .set file. The file is read in the browser; nothing is uploaded anywhere. -->
<script lang="ts">
  import { readScenarioFile, ScenarioError, type Scenario } from '@boltzmann4d/engine/scenario';
  import { Simulator } from '@boltzmann4d/simulator';
  import { Button } from '@boltzmann4d/ui/button';
  import FileUpIcon from '@lucide/svelte/icons/file-up';
  import XIcon from '@lucide/svelte/icons/x';

  /** The scenario running, with its file name. A new object for each file opened. */
  let running = $state.raw<{ name: string; scenario: Scenario } | null>(null);
  let warnings = $state.raw<string[]>([]);
  /** Problems with the last file picked, one per line, with that file's name. */
  let failure = $state.raw<{ name: string; problems: string[] } | null>(null);
  let dragging = $state(false);
  let input: HTMLInputElement;

  async function open(file: File | undefined) {
    if (!file) return;
    try {
      const { scenario, warnings: found } = readScenarioFile(file.name, await file.text());
      running = { name: file.name, scenario };
      warnings = found;
      failure = null;
    } catch (error) {
      failure = {
        name: file.name,
        problems:
          error instanceof ScenarioError
            ? error.problems
            : [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    void open(event.dataTransfer?.files[0]);
  }
</script>

<svelte:head>
  <title>{running ? `${running.name} · ` : ''}Open a scenario · Boltzmann 4D</title>
</svelte:head>

<input
  bind:this={input}
  type="file"
  accept=".json,.set,application/json"
  class="hidden"
  onchange={(event) => {
    void open(event.currentTarget.files?.[0]);
    // Picking the same file again should reload it.
    event.currentTarget.value = '';
  }}
/>

{#snippet problems(failed: { name: string; problems: string[] })}
  <div
    class="border-destructive/50 text-destructive relative rounded-md border p-3 pr-10 text-sm"
    role="alert"
  >
    <p class="font-medium">Can't open {failed.name}:</p>
    <Button
      variant="ghost"
      size="icon-sm"
      class="absolute top-1.5 right-1.5"
      aria-label="Dismiss"
      onclick={() => (failure = null)}
    >
      <XIcon aria-hidden="true" />
    </Button>
    <ul class="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 break-words">
      {#each failed.problems as problem, i (i)}
        <li>{problem}</li>
      {/each}
    </ul>
  </div>
{/snippet}

{#if running}
  <div class="flex h-full flex-col">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2">
      <p class="min-w-0 flex-1 truncate text-sm">
        Running <span class="font-medium">{running.name}</span>
      </p>
      <Button variant="outline" size="sm" onclick={() => input.click()}>
        <FileUpIcon aria-hidden="true" />
        Open another file
      </Button>
      {#if failure}
        <div class="w-full">{@render problems(failure)}</div>
      {/if}
      {#each warnings as warning, i (i)}
        <p class="text-muted-foreground w-full text-xs">{warning}</p>
      {/each}
    </div>
    <div class="min-h-0 flex-1">
      <Simulator scenario={running} />
    </div>
  </div>
{:else}
  <div class="mx-auto max-w-2xl space-y-4 px-4 py-6">
    <h1 class="text-2xl font-semibold">Open a scenario</h1>
    <p class="text-muted-foreground">
      Run a scenario from your computer: a Boltzmann 4D <code>.json</code> file, or a
      <code>.set</code> file saved by the Boltzmann 3D desktop app. The file stays in your browser.
    </p>
    <div
      role="region"
      aria-label="Drop a scenario file here"
      class={[
        'flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-10 text-center',
        dragging ? 'border-primary bg-muted' : 'border-border',
      ]}
      ondragover={(event) => {
        event.preventDefault();
        dragging = true;
      }}
      ondragleave={() => (dragging = false)}
      ondrop={onDrop}
    >
      <FileUpIcon class="text-muted-foreground size-8" aria-hidden="true" />
      <Button size="lg" onclick={() => input.click()}>Choose a file</Button>
      <p class="text-muted-foreground text-sm">or drop it here</p>
    </div>
    {#if failure}
      {@render problems(failure)}
    {/if}
  </div>
{/if}
