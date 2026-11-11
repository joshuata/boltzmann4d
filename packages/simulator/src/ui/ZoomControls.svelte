<!-- Zoom buttons over the arena (CTRL-7): out and in by about 25%, a typed percentage, and
     fit (back to 100%, the whole arena in view). Pinch, wheel and keys are zoom-view.ts. -->
<script lang="ts">
  import { Button } from '@boltzmann4d/ui/button';
  import ScanIcon from '@lucide/svelte/icons/scan';
  import ZoomInIcon from '@lucide/svelte/icons/zoom-in';
  import ZoomOutIcon from '@lucide/svelte/icons/zoom-out';
  import { MAX_ZOOM, MIN_ZOOM, formatZoom, parseZoom, stepZoom } from './zoom';

  interface Props {
    zoom: number;
    onZoom: (zoom: number) => void;
  }

  let { zoom, onZoom }: Props = $props();

  /** The text being typed, or null while the field shows the current zoom. */
  let draft = $state<string | null>(null);

  function commit() {
    const typed = draft === null ? null : parseZoom(draft);
    draft = null;
    if (typed !== null) onZoom(typed);
  }
</script>

<div
  class="bg-background/60 absolute right-2 bottom-2 flex items-center rounded-md backdrop-blur-sm"
  role="group"
  aria-label="Zoom"
>
  <Button
    variant="ghost"
    size="icon"
    aria-label="Zoom out"
    title="Zoom out (−)"
    disabled={zoom <= MIN_ZOOM}
    onclick={() => onZoom(stepZoom(zoom, -1))}
  >
    <ZoomOutIcon aria-hidden="true" />
  </Button>
  <input
    class="focus-visible:ring-ring h-9 w-14 rounded-md bg-transparent text-center text-sm tabular-nums outline-none focus-visible:ring-2"
    inputmode="numeric"
    aria-label="Zoom percentage"
    title="Type a zoom percentage"
    value={draft ?? formatZoom(zoom)}
    onfocus={(event) => {
      draft = formatZoom(zoom);
      event.currentTarget.select();
    }}
    oninput={(event) => (draft = event.currentTarget.value)}
    onblur={commit}
    onkeydown={(event) => {
      if (event.key === 'Enter') event.currentTarget.blur();
      else if (event.key === 'Escape') {
        draft = null;
        event.currentTarget.blur();
      }
    }}
  />
  <Button
    variant="ghost"
    size="icon"
    aria-label="Zoom in"
    title="Zoom in (+)"
    disabled={zoom >= MAX_ZOOM}
    onclick={() => onZoom(stepZoom(zoom, 1))}
  >
    <ZoomInIcon aria-hidden="true" />
  </Button>
  <Button
    variant="ghost"
    size="icon"
    aria-label="Fit the arena"
    title="Fit the arena (0)"
    disabled={zoom === 1}
    onclick={() => onZoom(1)}
  >
    <ScanIcon aria-hidden="true" />
  </Button>
</div>
