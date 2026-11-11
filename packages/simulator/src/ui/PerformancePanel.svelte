<!-- Diagnostics (ADV-1, ADV-2): particle count and frame rates in the heading, and where the
     time goes and where drawing happens inside. Collapsed until the reader opens it. -->
<script lang="ts">
  import SidebarPanel from './SidebarPanel.svelte';
  import type { SimulationClient } from './simulation.svelte';

  let { sim }: { sim: SimulationClient } = $props();
</script>

<SidebarPanel
  id="performance"
  title="Performance"
  subtitle={sim.loading
    ? 'Loading…'
    : `${sim.particleCount} particles, ${sim.simulationFps.toFixed(0)} fps`}
  defaultOpen={false}
>
  <div class="text-muted-foreground space-y-1 text-xs tabular-nums">
    <p>
      {sim.drawnFps.toFixed(0)} frames drawn per second · physics {sim.physicsMs.toFixed(2)} ms/frame
    </p>
    <p>{sim.simulatedPsPerSecond.toFixed(1)} ps simulated per second</p>
    <p>Rendering on the {sim.renderThread === 'worker' ? 'render worker' : 'main thread'}</p>
  </div>
</SidebarPanel>
