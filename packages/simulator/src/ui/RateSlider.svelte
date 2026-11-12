<!-- Simulation speed (CTRL-2): multiplies how fast simulated time runs, in doubling steps
     from 1× (the scenario's own speed, the default) to 2048×; double-click to go back to
     1×. At high speeds particles jump too far per frame to follow, and the physics may not
     keep up in real time; that's expected. -->
<script lang="ts">
  import { Slider } from '@boltzmann4d/ui/slider';

  interface Props {
    value: number;
    disabled?: boolean;
    onChange: (scale: number) => void;
  }

  let { value, disabled = false, onChange }: Props = $props();

  /** Powers of two: 2⁰ = 1× to 2¹¹ = 2048×. */
  const MIN_STEP = 0;
  const MAX_STEP = 11;

  /** The nearest step to a scale (scales set elsewhere may fall between steps). */
  const stepOf = (scale: number) =>
    Math.min(MAX_STEP, Math.max(MIN_STEP, Math.round(Math.log2(scale))));

  const format = (scale: number) => (scale >= 1 ? scale.toFixed(0) : scale.toPrecision(2));
</script>

<div class="mt-3 grid gap-2 text-sm">
  <div class="flex justify-between">
    <span class="font-medium">Speed</span>
    <output class="tabular-nums">{format(value)}×</output>
  </div>
  <!-- The padding gives the thumb a bigger touch target on phones and tablets. -->
  <Slider
    type="single"
    thumbLabel="Speed"
    class="py-2"
    min={MIN_STEP}
    max={MAX_STEP}
    step={1}
    value={stepOf(value)}
    {disabled}
    title="Double-click to reset to 1×"
    getValueText={(step) => `${format(2 ** step)} times`}
    onValueChange={(step) => onChange(2 ** step)}
    ondblclick={() => onChange(1)}
  />
  <div class="text-muted-foreground flex justify-between text-xs" aria-hidden="true">
    <span>{format(2 ** MIN_STEP)}×</span>
    <span>{format(2 ** MAX_STEP)}×</span>
  </div>
</div>
