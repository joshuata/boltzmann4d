<!-- Developer example (joshuata/boltzmann4d#84): custom statistics computed on the main
     thread from <Simulator>'s state snapshots. The speed histogram reads `bind:snapshot`
     (instantaneous); the mean free path accumulates every event through `onsnapshot`.
     Compare them with the sidebar's Instantaneous Speed and Free path plots. Not linked
     from the navbar. -->
<script lang="ts">
  import {
    FreePathAccumulator,
    SimulationClient,
    Simulator,
    SnapshotSpeedHistogram,
    type StateSnapshot,
  } from '@boltzmann4d/simulator';

  let snapshot = $state<StateSnapshot | null>(null);
  let client = $state<SimulationClient | null>(null);
  /** ms between snapshots; emptying the field (null) stops them. */
  let interval = $state<number | null>(250);

  const paths = new FreePathAccumulator();
  let freePath = $state({ count: 0, mean: NaN });

  function onsnapshot(next: StateSnapshot) {
    paths.add(next);
    freePath = { count: paths.count, mean: paths.mean };
  }
</script>

<svelte:head><title>Snapshot statistics · Boltzmann 4D</title></svelte:head>

<!-- Phones: the viewer takes most of the screen and the page scrolls to the examples.
     Wider screens: the examples sit under the viewer, which fills the rest. -->
<div class="flex flex-col md:h-full md:min-h-0">
  <div class="h-[85dvh] shrink-0 md:h-auto md:min-h-96 md:flex-1">
    <Simulator
      preset="default"
      snapshotInterval={interval}
      snapshotEvents
      bind:snapshot
      bind:client
      {onsnapshot}
    />
  </div>
  <section class="grid gap-4 border-t p-4 md:grid-cols-2" aria-label="Snapshot statistics">
    <div class="space-y-2">
      <h2 class="text-sm font-semibold">Speeds from <code>bind:snapshot</code></h2>
      {#if snapshot && client}
        <SnapshotSpeedHistogram {snapshot} typeColors={client.kinds.map((k) => k.color)} />
      {:else}
        <p class="text-muted-foreground text-sm">Waiting for the first snapshot…</p>
      {/if}
    </div>
    <div class="space-y-2">
      <h2 class="text-sm font-semibold">Mean free path from <code>onsnapshot</code></h2>
      <p class="text-2xl tabular-nums">
        {Number.isFinite(freePath.mean) ? (freePath.mean * 1e9).toFixed(3) : '–'} nm
      </p>
      <p class="text-muted-foreground text-xs tabular-nums">
        over {freePath.count} paths since the run started
      </p>
      <label class="text-muted-foreground flex items-center gap-2 text-xs">
        Snapshot every
        <input
          type="number"
          min="16"
          step="50"
          bind:value={interval}
          title="Empty stops the snapshots"
          class="bg-background w-20 rounded border px-2 py-1"
        />
        ms
      </label>
    </div>
  </section>
</div>
