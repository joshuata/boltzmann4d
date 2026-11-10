<!-- The simulation editor (plan 0008): build a scenario from a preset, a file or one kept in
     this browser, check it as you type, run it, save it in this browser, and download it as
     Boltzmann 4D JSON or a Boltzmann 3D .set file. Running is the page's job (onRun). -->
<script lang="ts">
  import {
    loadPresetScenario,
    readScenarioFile,
    ScenarioError,
    scenarioToSetFile,
    stringifyScenario,
    type Scenario,
  } from '@boltzmann4d/engine/scenario';
  import { presetCatalog } from '@boltzmann4d/engine/io/presets';
  import { Button } from '@boltzmann4d/ui/button';
  import { Checkbox } from '@boltzmann4d/ui/checkbox';
  import DownloadIcon from '@lucide/svelte/icons/download';
  import SaveIcon from '@lucide/svelte/icons/save';
  import FileUpIcon from '@lucide/svelte/icons/file-up';
  import PlayIcon from '@lucide/svelte/icons/play';
  import {
    BOUNDARY_LABELS,
    boundariesFor,
    canConduct,
    canDemon,
    canReact,
    checkForm,
    formFromScenario,
    keepsPositions,
    type EditorForm,
  } from './form';
  import NumberField from './NumberField.svelte';
  import {
    getDefaultScenario,
    getScenario,
    isReadable,
    listScenarios,
    saveScenario,
    type SavedScenario,
  } from './scenario-store';
  import SpeciesEditor from './SpeciesEditor.svelte';

  interface Props {
    /** Runs the scenario (the page shows it next to the form). */
    onRun: (scenario: Scenario, name: string) => void;
    /**
     * A scenario kept in this browser to start from, read once when the editor opens.
     * Without it the editor starts from the user's default, else the bundled default.
     */
    startId?: string | null;
    /** After a save, e.g. so the page can point its URL at the saved scenario. */
    onSaved?: (saved: SavedScenario) => void;
  }

  let { onRun, startId = null, onSaved }: Props = $props();

  /** What the form started from: everything it doesn't show comes from here. */
  let base = $state.raw<Scenario | null>(null);
  let form = $state<EditorForm | null>(null);
  /** The scenario's name: what it's saved as, and the file name for downloads. */
  let name = $state('default');
  /** Problems with the last file opened, or a preset that failed to load. */
  let loadProblems = $state.raw<string[]>([]);
  let fileInput: HTMLInputElement;
  /** The kept scenario the form saves over, if it started from one. */
  let savedId = $state<string | null>(null);
  let kept = $state.raw<SavedScenario[]>([]);
  /** The "Start from" choice: `preset:<name>`, `saved:<id>`, or `file` after opening one. */
  let startValue = $state('preset:default');
  let saveStatus = $state<string | null>(null);

  const check = $derived(base && form ? checkForm(base, $state.snapshot(form)) : null);
  const errors = $derived(check?.fields ?? {});

  const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

  function start(
    scenario: Scenario,
    scenarioName: string,
    from: { value: string; savedId?: string | null },
  ) {
    base = scenario;
    form = formFromScenario(scenario);
    name = scenarioName;
    loadProblems = [];
    saveStatus = null;
    savedId = from.savedId ?? null;
    startValue = from.value;
  }

  async function startFromPreset(preset: string) {
    try {
      start(await loadPresetScenario(preset), preset, { value: `preset:${preset}` });
    } catch (error) {
      loadProblems = [message(error)];
    }
  }

  function startFromSaved(entry: SavedScenario) {
    start(entry.scenario, entry.name.replace(/\.(json|set)$/i, ''), {
      value: `saved:${entry.id}`,
      savedId: entry.id,
    });
  }

  function startFrom(value: string) {
    const [kind, ...rest] = value.split(':');
    const key = rest.join(':');
    if (kind === 'preset') return void startFromPreset(key);
    const entry = kept.find((e) => e.id === key);
    if (entry) startFromSaved(entry);
  }

  async function refreshKept() {
    try {
      kept = (await listScenarios()).filter(isReadable);
    } catch {
      kept = [];
    }
  }

  /** The startId scenario, else the user's default, else the bundled default (FILE-2). */
  async function init() {
    await refreshKept();
    try {
      const wanted = startId ? await getScenario(startId) : null;
      if (startId && !(wanted && isReadable(wanted))) {
        loadProblems = [
          wanted
            ? `Can't open ${wanted.name}: ${wanted.problems.join('; ')}`
            : 'That scenario is no longer saved in this browser.',
        ];
      }
      const entry = wanted && isReadable(wanted) ? wanted : await getDefaultScenario();
      if (entry) {
        const problems = loadProblems;
        startFromSaved(entry);
        loadProblems = problems;
        return;
      }
    } catch {
      // No storage in this browser: start from the bundled default.
    }
    const problems = loadProblems;
    await startFromPreset('default');
    loadProblems = [...problems, ...loadProblems];
  }

  async function save(asNew: boolean) {
    const scenario = check?.scenario;
    if (!scenario) return;
    try {
      const saved = await saveScenario({
        id: asNew ? undefined : (savedId ?? undefined),
        name,
        scenario,
      });
      savedId = saved.id;
      // The form now describes what's stored, so it starts from that.
      base = saved.scenario;
      await refreshKept();
      startValue = `saved:${saved.id}`;
      saveStatus = `Saved “${saved.name}” in this browser.`;
      onSaved?.(saved);
    } catch (error) {
      saveStatus = `Couldn't save: ${message(error)}`;
    }
  }

  async function startFromFile(file: File | undefined) {
    if (!file) return;
    try {
      const { scenario } = readScenarioFile(file.name, await file.text());
      start(scenario, file.name.replace(/\.(json|set)$/i, ''), { value: 'file' });
    } catch (error) {
      loadProblems =
        error instanceof ScenarioError
          ? [`Can't open ${file.name}:`, ...error.problems]
          : [String(error)];
    }
  }

  void init();

  function setDimensions(d: 1 | 2 | 3) {
    if (!form) return;
    form.dimensions = d;
    if (!boundariesFor(d).includes(form.boundary)) form.boundary = 'DIVIDED';
  }

  function download(text: string, extension: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name.trim() || 'scenario'}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const selectClass =
    'border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-2.5 text-base shadow-xs outline-none focus-visible:ring-3 md:text-sm';
</script>

<input
  bind:this={fileInput}
  type="file"
  accept=".json,.set,application/json"
  class="hidden"
  onchange={(event) => {
    void startFromFile(event.currentTarget.files?.[0]);
    event.currentTarget.value = '';
  }}
/>

<div class="space-y-5">
  <section class="space-y-2" aria-labelledby="start-heading">
    <h2 id="start-heading" class="text-sm font-semibold">Start from</h2>
    <div class="flex flex-wrap gap-2">
      <select
        class={[selectClass, 'min-w-0 flex-1']}
        aria-label="Scenario to start from"
        value={startValue}
        onchange={(e) => startFrom(e.currentTarget.value)}
      >
        {#if startValue === 'file'}
          <option value="file">{name} (opened file)</option>
        {/if}
        {#if kept.length > 0}
          <optgroup label="Kept in this browser">
            {#each kept as entry (entry.id)}
              <option value="saved:{entry.id}">{entry.name}</option>
            {/each}
          </optgroup>
        {/if}
        <optgroup label="Presets">
          {#each presetCatalog as preset (preset.name)}
            <option value="preset:{preset.name}">{preset.label} ({preset.dimensions}D)</option>
          {/each}
        </optgroup>
      </select>
      <Button variant="outline" onclick={() => fileInput.click()}>
        <FileUpIcon aria-hidden="true" />
        Open a file
      </Button>
    </div>
    {#if loadProblems.length > 0}
      <ul class="text-destructive list-none space-y-0.5 text-sm break-words" role="alert">
        {#each loadProblems as problem, i (i)}<li>{problem}</li>{/each}
      </ul>
    {/if}
  </section>

  {#if form}
    <fieldset class="space-y-3 rounded-lg border p-3">
      <legend class="px-1 text-sm font-semibold">Arena</legend>
      <div class="space-y-1">
        <span class="text-sm font-medium" id="dimensions-label">Dimensions</span>
        <div class="flex gap-2" role="radiogroup" aria-labelledby="dimensions-label">
          {#each [1, 2, 3] as const as d (d)}
            <Button
              variant={form.dimensions === d ? 'default' : 'outline'}
              role="radio"
              aria-checked={form.dimensions === d}
              onclick={() => setDimensions(d)}
            >
              {d}D
            </Button>
          {/each}
        </div>
      </div>
      <div class={['grid gap-3', form.dimensions === 3 ? 'grid-cols-3' : 'grid-cols-2']}>
        <NumberField
          id="size-x"
          label="Width"
          unit="nm"
          bind:value={form.size[0]}
          error={errors['size.0']}
        />
        {#if form.dimensions > 1}
          <NumberField
            id="size-y"
            label="Height"
            unit="nm"
            bind:value={form.size[1]}
            error={errors['size.1']}
          />
        {/if}
        {#if form.dimensions === 3}
          <NumberField
            id="size-z"
            label="Depth"
            unit="nm"
            bind:value={form.size[2]}
            error={errors['size.2']}
          />
        {/if}
      </div>
      <div class="space-y-1">
        <label for="boundary" class="text-sm font-medium">Walls</label>
        <select id="boundary" class={selectClass} bind:value={form.boundary}>
          {#each boundariesFor(form.dimensions) as boundary (boundary)}
            <option value={boundary}>{BOUNDARY_LABELS[boundary]}</option>
          {/each}
        </select>
      </div>
      {#if form.boundary === 'HOLE'}
        <NumberField
          id="hole-size"
          label="Hole diameter"
          unit="nm"
          bind:value={form.holeSize}
          step={1}
          error={errors.holeSize}
        />
      {/if}
      {#if canConduct(form)}
        <div class="flex min-h-8 items-center gap-2">
          <Checkbox id="conducting" bind:checked={form.conductingDivider} />
          <label for="conducting" class="text-sm">Divider conducts heat</label>
        </div>
      {/if}
      {#if canDemon(form)}
        <div class="flex min-h-8 items-center gap-2">
          <Checkbox id="demon" bind:checked={form.maxwellDemon} />
          <label for="demon" class="text-sm">Maxwell's demon (the hole starts closed)</label>
        </div>
      {/if}
    </fieldset>

    {@const positions = base ? keepsPositions(base, form) : true}
    <SpeciesEditor color="red" bind:species={form.red} {errors} keepsPositions={positions} />
    <SpeciesEditor color="blue" bind:species={form.blue} {errors} keepsPositions={positions} />
    {#if !positions && (form.red.placed > 0 || form.blue.placed > 0)}
      <p class="text-muted-foreground -mt-2 text-xs">
        The arena changed, so every particle is placed at random.
      </p>
    {/if}

    <fieldset class="space-y-1 rounded-lg border p-3">
      <legend class="px-1 text-sm font-semibold">Starting</legend>
      {#if canReact(form)}
        <div class="flex min-h-8 items-center gap-2">
          <Checkbox id="reaction" bind:checked={form.reaction} />
          <label for="reaction" class="text-sm">Reactions: red turns blue, and back</label>
        </div>
      {/if}
      <div class="flex min-h-8 items-center gap-2">
        <Checkbox id="paused" bind:checked={form.paused} />
        <label for="paused" class="text-sm">Start paused</label>
      </div>
    </fieldset>

    {#if check && check.problems.length > 0}
      <ul
        class="border-destructive/50 text-destructive list-disc space-y-0.5 rounded-md border p-3 pl-7 text-sm break-words"
        role="alert"
      >
        {#each check.problems as problem, i (i)}<li>{problem}</li>{/each}
      </ul>
    {/if}

    <div class="space-y-3">
      <Button
        size="lg"
        class="w-full"
        disabled={!check?.scenario}
        onclick={() => check?.scenario && onRun(check.scenario, name)}
      >
        <PlayIcon aria-hidden="true" />
        Run
      </Button>
      <div class="space-y-1">
        <label for="scenario-name" class="text-sm font-medium">Name</label>
        <input id="scenario-name" class={selectClass} bind:value={name} autocomplete="off" />
      </div>
      <div class="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          class="flex-1"
          disabled={!check?.scenario}
          onclick={() => void save(false)}
        >
          <SaveIcon aria-hidden="true" />
          {savedId ? 'Save' : 'Save in this browser'}
        </Button>
        {#if savedId}
          <Button
            variant="outline"
            class="flex-1"
            disabled={!check?.scenario}
            onclick={() => void save(true)}
          >
            Save as new
          </Button>
        {/if}
      </div>
      {#if saveStatus}
        <p class="text-muted-foreground text-sm" role="status">{saveStatus}</p>
      {/if}
      <div class="flex flex-wrap gap-2">
        <Button
          variant="outline"
          class="flex-1"
          disabled={!check?.scenario}
          onclick={() =>
            check?.scenario &&
            download(stringifyScenario(check.scenario), 'json', 'application/json')}
        >
          <DownloadIcon aria-hidden="true" />
          Download .json
        </Button>
        <Button
          variant="outline"
          class="flex-1"
          disabled={!check?.scenario}
          onclick={() =>
            check?.scenario && download(scenarioToSetFile(check.scenario), 'set', 'text/plain')}
        >
          <DownloadIcon aria-hidden="true" />
          Download .set
        </Button>
      </div>
      <p class="text-muted-foreground text-xs">
        .json is this app's format; .set files also open in the Boltzmann 3D desktop app.
      </p>
    </div>
  {/if}
</div>
