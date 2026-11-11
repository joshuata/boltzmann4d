<!-- The simulation clock (CTRL-1): simulated time since the last restart, in ps. -->
<script lang="ts">
  interface Props {
    /** Seconds. */
    time: number;
  }

  let { time }: Props = $props();

  const ps = $derived(time * 1e12);
</script>

<p
  class="bg-background flex min-h-10 items-center rounded-md border px-3 text-sm tabular-nums"
  title="Simulated time since the last restart"
>
  <span class="sr-only">Clock:</span>
  {ps < 1000 ? ps.toFixed(1) : ps.toFixed(0)}&nbsp;ps
</p>
