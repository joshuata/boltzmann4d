<!-- Your scenarios: open a scenario file from your computer (FILE-1: Boltzmann 4D JSON or a
     Boltzmann 3D .set file), and the scenarios kept in this browser, saved from the editor
     or opened before. `?id=` runs one. Files are read in the browser; nothing is uploaded. -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import {
    readScenarioFile,
    ScenarioError,
    stringifyScenario,
    type Scenario,
  } from '@boltzmann4d/engine/scenario';
  import {
    deleteScenario,
    getDefaultScenarioId,
    getScenario,
    isReadable,
    keepOpenedFile,
    listScenarios,
    setDefaultScenarioId,
    summarizeScenario,
    type SavedScenario,
    type UnreadableScenario,
  } from '@boltzmann4d/simulation-editor';
  import { Simulator } from '@boltzmann4d/simulator';
  import { Button } from '@boltzmann4d/ui/button';
  import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
  import FileUpIcon from '@lucide/svelte/icons/file-up';
  import XIcon from '@lucide/svelte/icons/x';

  /** The stored scenario to run, from the URL. */
  const id = $derived(page.url.searchParams.get('id'));

  /** The scenario running, as a new object each time one starts. */
  let running = $state.raw<{ name: string; scenario: Scenario } | null>(null);
  let warnings = $state.raw<string[]>([]);
  /** Problems with the last file picked, or a stored scenario that can't run. */
  let failure = $state.raw<{ name: string; problems: string[] } | null>(null);
  let entries = $state.raw<(SavedScenario | UnreadableScenario)[] | null>(null);
  let defaultId = $state<string | null>(null);
  /** Set when this browser won't store anything (e.g. some private windows). */
  let storageProblem = $state<string | null>(null);
  let dragging = $state(false);
  let input: HTMLInputElement;

  const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
  const scenarioHref = (entryId: string) =>
    `${resolve('/upload')}?id=${encodeURIComponent(entryId)}`;
  const editHref = (entryId: string) => `${resolve('/editor')}?id=${encodeURIComponent(entryId)}`;

  async function refresh() {
    try {
      [entries, defaultId] = await Promise.all([listScenarios(), getDefaultScenarioId()]);
      storageProblem = null;
    } catch (error) {
      entries = [];
      storageProblem = message(error);
    }
  }

  // Follow the URL: with ?id= run that stored scenario, without it show the list.
  $effect(() => {
    const wanted = id;
    if (!wanted) {
      running = null;
      void refresh();
      return;
    }
    void getScenario(wanted)
      .then((entry) => {
        if (id !== wanted) return;
        if (entry && isReadable(entry)) {
          running = { name: entry.name, scenario: entry.scenario };
        } else {
          running = null;
          failure = {
            name: entry?.name ?? 'that scenario',
            problems: entry ? entry.problems : ['It is no longer saved in this browser.'],
          };
          void goto(resolve('/upload'), { replaceState: true });
        }
      })
      .catch((error: unknown) => (failure = { name: 'that scenario', problems: [message(error)] }));
  });

  async function open(file: File | undefined) {
    if (!file) return;
    let scenario: Scenario;
    try {
      const read = readScenarioFile(file.name, await file.text());
      scenario = read.scenario;
      warnings = read.warnings;
      failure = null;
    } catch (error) {
      failure = {
        name: file.name,
        problems: error instanceof ScenarioError ? error.problems : [message(error)],
      };
      return;
    }
    try {
      const saved = await keepOpenedFile(file.name, scenario);
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- the path is resolve()d; only a query is added
      await goto(`${resolve('/upload')}?id=${encodeURIComponent(saved.id)}`);
    } catch (error) {
      // Can't store it: run it anyway, just for now.
      storageProblem = message(error);
      running = { name: file.name, scenario };
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    void open(event.dataTransfer?.files[0]);
  }

  function download(entry: SavedScenario) {
    const url = URL.createObjectURL(
      new Blob([stringifyScenario(entry.scenario)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${entry.name.replace(/\.(json|set)$/i, '')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function toggleDefault(entry: SavedScenario) {
    await setDefaultScenarioId(defaultId === entry.id ? null : entry.id);
    await refresh();
  }

  async function remove(entry: SavedScenario | UnreadableScenario) {
    if (!confirm(`Delete “${entry.name}” from this browser? This can't be undone.`)) return;
    await deleteScenario(entry.id);
    await refresh();
  }

  const savedAt = (ms: number) =>
    new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
</script>

<svelte:head>
  <title>{running ? `${running.name} · ` : ''}Your scenarios · Boltzmann 4D</title>
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
      <Button variant="ghost" size="sm" href={resolve('/upload')}>
        <ArrowLeftIcon aria-hidden="true" />
        Your scenarios
      </Button>
      <p class="min-w-0 flex-1 truncate text-sm font-medium">{running.name}</p>
      {#if id}
        <Button variant="outline" size="sm" href={editHref(id)}>Edit</Button>
      {/if}
      <Button variant="outline" size="sm" onclick={() => input.click()}>
        <FileUpIcon aria-hidden="true" />
        Open a file
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
  <div class="mx-auto max-w-2xl space-y-6 px-4 py-6">
    <div class="space-y-2">
      <h1 class="text-2xl font-semibold">Your scenarios</h1>
      <p class="text-muted-foreground">
        Open a Boltzmann 4D <code>.json</code> file, or a <code>.set</code> file saved by the
        Boltzmann 3D desktop app. Files you open and scenarios you save in the
        <a class="underline" href={resolve('/editor')}>editor</a> are kept in this browser.
      </p>
    </div>
    <div
      role="region"
      aria-label="Drop a scenario file here"
      class={[
        'flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-8 text-center',
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
      <Button size="lg" onclick={() => input.click()}>Open a file</Button>
      <p class="text-muted-foreground text-sm">or drop it here</p>
    </div>
    {#if failure}
      {@render problems(failure)}
    {/if}
    {#if storageProblem}
      <p class="text-muted-foreground text-sm" role="status">
        This browser isn't keeping scenarios ({storageProblem}). Files still open, but won't be
        listed here next time.
      </p>
    {/if}

    <section class="space-y-2" aria-labelledby="saved-heading">
      <h2 id="saved-heading" class="text-lg font-semibold">Kept in this browser</h2>
      {#if entries === null}
        <p class="text-muted-foreground text-sm">Loading…</p>
      {:else if entries.length === 0}
        <p class="text-muted-foreground text-sm">
          None yet. Open a file, or build one in the editor and save it.
        </p>
      {:else}
        <ul class="divide-y rounded-lg border">
          {#each entries as entry (entry.id)}
            <li class="space-y-2 p-3">
              <div class="flex flex-wrap items-baseline gap-x-2">
                <p class="min-w-0 font-medium break-words">{entry.name}</p>
                {#if entry.id === defaultId}
                  <span class="bg-muted rounded px-1.5 py-0.5 text-xs">Default</span>
                {/if}
              </div>
              {#if isReadable(entry)}
                <p class="text-muted-foreground text-sm">
                  {summarizeScenario(entry.scenario)} · saved {savedAt(entry.savedAt)}
                </p>
                <div class="flex flex-wrap gap-2">
                  <Button size="sm" href={scenarioHref(entry.id)}>Run</Button>
                  <Button size="sm" variant="outline" href={editHref(entry.id)}>Edit</Button>
                  <Button size="sm" variant="outline" onclick={() => download(entry)}>
                    Download
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-pressed={entry.id === defaultId}
                    title="The editor starts from your default"
                    onclick={() => void toggleDefault(entry)}
                  >
                    {entry.id === defaultId ? 'Stop using as default' : 'Make default'}
                  </Button>
                  <Button size="sm" variant="ghost" onclick={() => void remove(entry)}>
                    Delete
                  </Button>
                </div>
              {:else}
                <p class="text-destructive text-sm">
                  Can't be read: {entry.problems.join('; ')}
                </p>
                <Button size="sm" variant="ghost" onclick={() => void remove(entry)}>Delete</Button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
{/if}
