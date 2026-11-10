<!-- Which particle kinds the statistics show (KIND-4): all of them, or any set the user
     picks. Each kind is named with its colour and marker, so this is also the legend. -->
<script lang="ts">
  import type { KindInfo } from '../worker';
  import KindSwatch from './KindSwatch.svelte';

  interface Props {
    kinds: KindInfo[];
    /** Type indices, or null for all kinds. */
    selected: number[] | null;
    showMarkers: boolean;
    onChange: (selected: number[] | null) => void;
  }

  let { kinds, selected, showMarkers, onChange }: Props = $props();

  const isOn = (t: number) => selected === null || selected.includes(t);

  /** Toggles one kind; picking every kind (or none) means all of them. */
  function toggle(t: number) {
    const current = selected ?? kinds.map((_, k) => k);
    const next = current.includes(t) ? current.filter((k) => k !== t) : [...current, t];
    next.sort((a, b) => a - b);
    onChange(next.length === 0 || next.length === kinds.length ? null : next);
  }

  /** "Only this kind": a press on a kind while all are shown picks just that one. */
  function press(t: number) {
    if (selected === null) onChange([t]);
    else toggle(t);
  }
</script>

<div class="flex flex-wrap gap-1.5" role="group" aria-label="Particle kinds shown">
  <button
    type="button"
    class={[
      'min-h-8 rounded-md border px-2.5 text-xs font-medium',
      selected === null ? 'bg-primary text-primary-foreground border-primary' : 'bg-background',
    ]}
    aria-pressed={selected === null}
    onclick={() => onChange(null)}
  >
    All kinds
  </button>
  {#each kinds as kind, t (t)}
    <button
      type="button"
      class={[
        'flex min-h-8 items-center gap-1.5 rounded-md border px-2 text-xs',
        isOn(t) && selected !== null ? 'border-primary bg-accent' : 'bg-background',
        !isOn(t) && 'text-muted-foreground opacity-70',
      ]}
      aria-pressed={selected !== null && selected.includes(t)}
      title={selected === null ? `Show only ${kind.name}` : `Show or hide ${kind.name}`}
      onclick={() => press(t)}
    >
      <KindSwatch color={kind.color} marker={kind.marker} showMarker={showMarkers} />
      {kind.name}
    </button>
  {/each}
</div>
