<!-- Runs a scenario sent as a link: the editor's Share panel packs the scenario after `#`
     (encodeScenarioLink), so the whole scenario travels in the URL and nothing is stored
     on a server. Edit a copy keeps it in this browser and opens it in the editor.
     `?embed` (the layout hides the navbar) is for an iframe on another site: the bar offers to
     open the full page in a new tab instead. -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { ScenarioError, type Scenario } from '@boltzmann4d/engine/scenario';
  import { decodeScenarioLink, saveScenario } from '@boltzmann4d/simulation-editor';
  import { Simulator } from '@boltzmann4d/simulator';
  import { Button } from '@boltzmann4d/ui/button';
  import { withQuery } from '../../lib/with-query';

  let running = $state.raw<{ name: string; scenario: Scenario } | null>(null);
  let problems = $state.raw<string[]>([]);
  let status = $state<string | null>(null);
  const embedded = $derived(page.url.searchParams.has('embed'));

  async function load() {
    const code = location.hash.slice(1);
    if (!code) {
      running = null;
      problems = ['This link has no scenario in it. Ask for it to be sent again.'];
      return;
    }
    try {
      const scenario = await decodeScenarioLink(code);
      running = { name: scenario.name ?? 'Shared scenario', scenario };
      problems = [];
    } catch (error) {
      running = null;
      problems =
        error instanceof ScenarioError
          ? error.problems
          : [error instanceof Error ? error.message : String(error)];
    }
  }

  void load();

  async function editCopy() {
    if (!running) return;
    try {
      const saved = await saveScenario({ name: running.name, scenario: running.scenario });
      await goto(withQuery(resolve('/editor'), { id: saved.id }));
    } catch (error) {
      status = `Couldn't keep it in this browser: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
</script>

<svelte:window onhashchange={() => void load()} />

<svelte:head>
  <title>{running ? `${running.name} · ` : ''}Shared scenario · Boltzmann 4D</title>
</svelte:head>

{#if running}
  <div class="flex h-full flex-col">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2">
      <p class="min-w-0 flex-1 truncate text-sm font-medium">{running.name}</p>
      {#if embedded}
        <Button
          variant="outline"
          size="sm"
          href={`${resolve('/shared')}${page.url.hash}`}
          target="_blank"
          rel="noopener"
        >
          Open in Boltzmann 4D
        </Button>
      {:else}
        <Button
          variant="outline"
          size="sm"
          title="Keep a copy in this browser and open it in the editor"
          onclick={() => void editCopy()}
        >
          Edit a copy
        </Button>
      {/if}
      {#if status}
        <p class="text-destructive w-full text-sm" role="alert">{status}</p>
      {/if}
    </div>
    <div class="min-h-0 flex-1">
      <Simulator scenario={running} />
    </div>
  </div>
{:else if problems.length > 0}
  <div class="mx-auto max-w-2xl space-y-3 px-4 py-6">
    <h1 class="text-2xl font-semibold">Can't open this scenario</h1>
    <ul class="text-destructive list-disc space-y-0.5 pl-5 text-sm break-words" role="alert">
      {#each problems as problem, i (i)}<li>{problem}</li>{/each}
    </ul>
    <p class="text-muted-foreground text-sm">
      Try one of the built-in simulations from the <a class="underline" href={resolve('/')}
        >home page</a
      > instead.
    </p>
  </div>
{:else}
  <p class="text-muted-foreground px-4 py-6 text-sm">Loading…</p>
{/if}
