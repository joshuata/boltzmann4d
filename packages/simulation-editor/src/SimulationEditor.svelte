<!-- The scenario editor (plan 0010): draw walls and spawn regions on the arena, set up kinds
     and reactions, see problems as you edit, then run it, save it in this browser (plan 0008,
     EDIT-19), download it, or share it as a link or iframe. Running is the page's job: it gets the scenario through onRun.

     Wide screens: the canvas with its toolbar on the left, the panels on the right. Narrow
     screens: the canvas on top and the panels below it, the toolbar always in view (EDIT-23). -->
<script lang="ts">
  import {
    loadPresetScenario,
    readScenarioFile,
    ScenarioError,
    scenarioToSetFile,
    setFileCompatibility,
    stringifyScenario,
    type Scenario,
  } from '@boltzmann4d/engine/scenario';
  import { presetCatalog } from '@boltzmann4d/engine/io/presets';
  import { Button } from '@boltzmann4d/ui/button';
  import * as DropdownMenu from '@boltzmann4d/ui/dropdown-menu';
  import { Input } from '@boltzmann4d/ui/input';
  import DownloadIcon from '@lucide/svelte/icons/download';
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
  import CopyPlusIcon from '@lucide/svelte/icons/copy-plus';
  import PlayIcon from '@lucide/svelte/icons/play';
  import SaveIcon from '@lucide/svelte/icons/save';
  import ArenaPanel from './ArenaPanel.svelte';
  import Canvas from './Canvas.svelte';
  import { EditorState } from './editor.svelte';
  import KindsPanel from './KindsPanel.svelte';
  import ProblemsPanel from './ProblemsPanel.svelte';
  import ReactionsPanel from './ReactionsPanel.svelte';
  import RegionPanel from './RegionPanel.svelte';
  import SidebarOptions from './SidebarOptions.svelte';
  import {
    getDefaultScenario,
    getScenario,
    isReadable,
    listScenarios,
    saveScenario,
    type SavedScenario,
  } from './scenario-store';
  import { blankScenario, parseKey } from './scenario-ops';
  import SharePanel from './SharePanel.svelte';
  import { selectClass } from './styles';
  import Toolbar from './Toolbar.svelte';
  import WallPanel from './WallPanel.svelte';

  interface Props {
    /** Runs the scenario (EDIT-18); the page shows the simulator. */
    onRun: (scenario: Scenario, name: string) => void;
    /**
     * A scenario kept in this browser to start from, read once when the editor opens.
     * Without it the editor starts from the user's default (FILE-2), else a blank arena.
     */
    startId?: string | null;
    /** After a save, e.g. so the page can point its URL at the saved scenario. */
    onSaved?: (saved: SavedScenario) => void;
    /**
     * Turns a scenario link code (from encodeScenarioLink) into the full URL of the page that
     * runs it; `embed` for one shown in another site's iframe. With it, the editor's Share
     * panel offers a link to send, e.g. to students, and an iframe snippet.
     */
    shareUrl?: (code: string, embed: boolean) => string;
  }

  let { onRun, startId = null, onSaved, shareUrl }: Props = $props();

  const editor = new EditorState();
  /** Problems with the last file opened, or a preset that failed to load. */
  let loadProblems = $state.raw<string[]>([]);
  let fileInput: HTMLInputElement;
  /** The kept scenario Save writes over, if the editor opened one or has saved. */
  let savedId = $state<string | null>(null);
  let kept = $state.raw<SavedScenario[]>([]);
  let saveStatus = $state<string | null>(null);

  const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

  /** Opens a scenario; `fromSaved` is the kept scenario it came from, if any. */
  function open(scenario: Scenario, name: string, fromSaved: string | null = null) {
    editor.open(scenario, name);
    savedId = fromSaved;
    saveStatus = null;
    loadProblems = [];
  }

  function openSaved(entry: SavedScenario) {
    open(entry.scenario, entry.name.replace(/\.(json|set)$/i, ''), entry.id);
  }

  async function refreshKept() {
    try {
      kept = (await listScenarios()).filter(isReadable);
    } catch {
      kept = [];
    }
  }

  /** The startId scenario, else the user's default, else the blank arena already open. */
  async function init() {
    await refreshKept();
    let problems: string[] = [];
    try {
      const wanted = startId ? await getScenario(startId) : null;
      if (startId && !(wanted && isReadable(wanted))) {
        problems = [
          wanted
            ? `Can't open ${wanted.name}: ${wanted.problems.join('; ')}`
            : 'That scenario is no longer saved in this browser.',
        ];
      }
      const entry = wanted && isReadable(wanted) ? wanted : await getDefaultScenario();
      if (entry) openSaved(entry);
    } catch {
      // No storage in this browser: keep the blank arena.
    }
    loadProblems = problems;
  }

  void init();

  /** Saves what's drawn; a scenario that fails the schema can't be stored. */
  async function save(asNew: boolean) {
    if (!editor.validation.success) return;
    try {
      const saved = await saveScenario({
        id: asNew ? undefined : (savedId ?? undefined),
        name: editor.name,
        scenario: editor.validation.scenario,
      });
      savedId = saved.id;
      await refreshKept();
      saveStatus = `Saved “${saved.name}” in this browser.`;
      onSaved?.(saved);
    } catch (error) {
      saveStatus = `Couldn't save: ${message(error)}`;
    }
  }

  // Particle placement is checked a moment after edits stop (it resolves the scenario).
  $effect(() => {
    void editor.validation;
    const timer = setTimeout(() => editor.checkPlacement(), 250);
    return () => clearTimeout(timer);
  });

  async function startFromPreset(name: string) {
    try {
      open(await loadPresetScenario(name), name);
    } catch (error) {
      loadProblems = [message(error)];
    }
  }

  async function startFromFile(file: File | undefined) {
    if (!file) return;
    try {
      const { scenario } = readScenarioFile(file.name, await file.text());
      open(scenario, file.name.replace(/\.(json|set)$/i, ''));
    } catch (error) {
      loadProblems =
        error instanceof ScenarioError
          ? [`Can't open ${file.name}:`, ...error.problems]
          : [String(error)];
    }
  }

  function startFrom(value: string) {
    if (value === 'blank') {
      open(blankScenario(), 'New scenario');
    } else if (value === 'file') {
      fileInput.click();
    } else if (value.startsWith('saved:')) {
      const entry = kept.find((e) => `saved:${e.id}` === value);
      if (entry) openSaved(entry);
    } else {
      void startFromPreset(value);
    }
  }

  const setCheck = $derived(editor.validation.success ? setFileCompatibility(editor.validation.scenario) : null); // prettier-ignore

  function download(text: string, extension: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${editor.name.trim() || 'scenario'}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** The selection, sorted into walls and regions, for the inspector. */
  const selected = $derived.by(() => {
    const walls: string[] = [];
    const regions: string[] = [];
    for (const key of editor.selection) {
      const { type, id } = parseKey(key);
      (type === 'wall' ? walls : regions).push(id);
    }
    return { walls, regions };
  });
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

<div class="flex flex-col lg:h-full lg:min-h-0">
  <!-- Start from, name, run, save and share. -->
  <div class="flex flex-wrap items-end gap-2 border-b px-3 py-2">
    <div class="min-w-40 flex-1 space-y-1 sm:max-w-64">
      <label for="start-from" class="text-xs font-medium">Start from</label>
      <select
        id="start-from"
        class={selectClass}
        value=""
        onchange={(e) => {
          startFrom(e.currentTarget.value);
          e.currentTarget.value = '';
        }}
      >
        <option value="" disabled>Choose…</option>
        <option value="blank">A blank 2D arena</option>
        <option value="file">A file on this computer…</option>
        {#if kept.length > 0}
          <optgroup label="Kept in this browser">
            {#each kept as entry (entry.id)}
              <option value="saved:{entry.id}">{entry.name}</option>
            {/each}
          </optgroup>
        {/if}
        <optgroup label="Presets">
          {#each presetCatalog as preset (preset.name)}
            <option value={preset.name}>{preset.label} ({preset.dimensions}D)</option>
          {/each}
        </optgroup>
      </select>
    </div>
    <div class="min-w-40 flex-1 space-y-1 sm:max-w-64">
      <label for="scenario-name" class="text-xs font-medium">Name</label>
      <Input
        id="scenario-name"
        value={editor.name}
        autocomplete="off"
        oninput={(e) => (editor.name = e.currentTarget.value)}
      />
    </div>
    <div class="ml-auto flex flex-wrap gap-2">
      <Button
        disabled={!editor.runnable}
        title={editor.runnable ? 'Run this scenario' : 'Fix the problems listed to run it'}
        onclick={() => editor.runnable && onRun(editor.runnable, editor.name)}
      >
        <PlayIcon aria-hidden="true" />
        Run
      </Button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="secondary"
              disabled={!editor.validation.success}
              title={editor.validation.success
                ? 'Save in this browser or download'
                : 'Fix the problems listed to save it'}
            >
              <SaveIcon aria-hidden="true" />
              Save
              <ChevronDownIcon aria-hidden="true" />
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" class="w-64">
          <DropdownMenu.Group>
            <DropdownMenu.Label>In this browser</DropdownMenu.Label>
            <DropdownMenu.Item onSelect={() => void save(false)}>
              <SaveIcon aria-hidden="true" />
              {savedId ? 'Save' : 'Keep in this browser'}
            </DropdownMenu.Item>
            {#if savedId}
              <DropdownMenu.Item onSelect={() => void save(true)}>
                <CopyPlusIcon aria-hidden="true" />
                Save as new
              </DropdownMenu.Item>
            {/if}
          </DropdownMenu.Group>
          <DropdownMenu.Separator />
          <DropdownMenu.Group>
            <DropdownMenu.Label>Download</DropdownMenu.Label>
            <DropdownMenu.Item
              onSelect={() =>
                editor.validation.success &&
                download(stringifyScenario(editor.validation.scenario), 'json', 'application/json')}
            >
              <DownloadIcon aria-hidden="true" />
              Boltzmann 4D file (.json)
            </DropdownMenu.Item>
            <DropdownMenu.Item
              disabled={!setCheck || setCheck.problems.length > 0}
              onSelect={() =>
                editor.validation.success &&
                download(scenarioToSetFile(editor.validation.scenario), 'set', 'text/plain')}
            >
              <DownloadIcon aria-hidden="true" />
              Boltzmann 3D file (.set)
            </DropdownMenu.Item>
            {#if setCheck && setCheck.problems.length > 0}
              <p class="text-muted-foreground px-2 pb-1.5 text-xs">
                Can't be a .set file: {setCheck.problems.join('; ')}
              </p>
            {/if}
          </DropdownMenu.Group>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      {#if shareUrl}
        <SharePanel scenario={editor.runnable} name={editor.name} {shareUrl} />
      {/if}
    </div>
    {#if saveStatus}
      <p class="text-muted-foreground w-full text-sm" role="status">{saveStatus}</p>
    {/if}
    {#if loadProblems.length > 0}
      <ul class="text-destructive w-full list-none space-y-0.5 text-sm break-words" role="alert">
        {#each loadProblems as problem, i (i)}<li>{problem}</li>{/each}
      </ul>
    {/if}
  </div>

  <div class="flex flex-col lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[1fr_360px]">
    <div class="sticky top-0 z-10 flex h-[50dvh] min-h-0 flex-col lg:static lg:h-auto">
      <Toolbar {editor} />
      <div class="min-h-0 flex-1">
        <Canvas {editor} />
      </div>
    </div>
    <aside
      class="space-y-5 border-t p-3 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l"
      aria-label="Settings"
    >
      <ProblemsPanel {editor} />
      {#if selected.walls.length > 0 && selected.regions.length === 0}
        <WallPanel {editor} ids={selected.walls} />
      {:else if selected.regions.length === 1 && selected.walls.length === 0}
        <RegionPanel {editor} id={selected.regions[0]!} />
      {:else if editor.selection.length > 0}
        <p class="text-muted-foreground text-sm">
          {editor.selection.length} shapes selected. Drag or use the arrow keys to move them; Delete removes
          them.
        </p>
      {:else}
        <ArenaPanel {editor} />
      {/if}
      <KindsPanel {editor} />
      <ReactionsPanel {editor} />
      <SidebarOptions {editor} />
      {#if setCheck && setCheck.problems.length > 0}
        <p class="text-muted-foreground text-xs">
          Download as .json: a .set file can't hold this scenario ({setCheck.problems.join('; ')}).
        </p>
      {/if}
    </aside>
  </div>
  <p class="sr-only" aria-live="polite">{editor.announcement}</p>
</div>
