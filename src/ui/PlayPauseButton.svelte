<!-- Port of view/maingui/components/PlayPauseButton.java: shows Play while paused, Pause while running. -->
<script lang="ts">
  interface Props {
    paused: boolean;
    disabled?: boolean;
    onToggle: (paused: boolean) => void;
  }

  let { paused, disabled = false, onToggle }: Props = $props();

  const label = $derived(paused ? 'Play' : 'Pause');
</script>

<button
  type="button"
  class="icon-button"
  {disabled}
  aria-label={label}
  title={label}
  onclick={() => onToggle(!paused)}
>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {#if paused}
      <path d="M7 4.5v15l12.5-7.5z" />
    {:else}
      <path d="M6 4.5h4v15H6zM14 4.5h4v15h-4z" />
    {/if}
  </svg>
</button>
