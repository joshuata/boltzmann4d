<!-- Port of view/maingui/components/PlayPauseButton.java: shows Play while paused, Pause while running. -->
<script lang="ts">
  import { Button } from '@boltzmann4d/ui/button';
  import PauseIcon from '@lucide/svelte/icons/pause';
  import PlayIcon from '@lucide/svelte/icons/play';

  interface Props {
    paused: boolean;
    disabled?: boolean;
    onToggle: (paused: boolean) => void;
  }

  let { paused, disabled = false, onToggle }: Props = $props();

  const label = $derived(paused ? 'Play' : 'Pause');
</script>

<Button
  variant="outline"
  size="icon-lg"
  {disabled}
  aria-label={label}
  title={label}
  onclick={() => onToggle(!paused)}
>
  {#if paused}
    <PlayIcon aria-hidden="true" />
  {:else}
    <PauseIcon aria-hidden="true" />
  {/if}
</Button>
