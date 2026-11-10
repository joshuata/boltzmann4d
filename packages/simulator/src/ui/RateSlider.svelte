<!-- Scales how fast simulated time runs, from MIN_SCALE× to MAX_SCALE× the preset's speed.
     The slider is logarithmic so 1× sits in the middle; double-click it to reset to 1×. -->
<script lang="ts">
  import { Slider } from '@boltzmann4d/ui/slider';

  interface Props {
    value: number;
    disabled?: boolean;
    onChange: (scale: number) => void;
  }

  let { value, disabled = false, onChange }: Props = $props();

  const MIN_SCALE = 0.1;
  const MAX_SCALE = 10;

  function format(scale: number): string {
    if (scale < 1) return scale.toFixed(2);
    if (scale < 10) return scale.toFixed(1);
    return scale.toFixed(0);
  }
</script>

<div class="my-4 grid gap-2 text-sm">
  <div class="flex justify-between">
    <span class="font-medium">Speed</span>
    <output class="tabular-nums">{format(value)}×</output>
  </div>
  <!-- The padding gives the thumb a bigger touch target on phones and tablets. -->
  <Slider
    type="single"
    thumbLabel="Speed"
    class="py-2"
    min={Math.log10(MIN_SCALE)}
    max={Math.log10(MAX_SCALE)}
    step={0.01}
    value={Math.log10(value)}
    {disabled}
    title="Double-click to reset to 1×"
    getValueText={(exponent) => `${format(10 ** exponent)} times`}
    onValueChange={(exponent) => onChange(10 ** exponent)}
    ondblclick={() => onChange(1)}
  />
  <div class="text-muted-foreground flex justify-between text-xs" aria-hidden="true">
    <span>{MIN_SCALE}×</span>
    <span>1×</span>
    <span>{MAX_SCALE}×</span>
  </div>
</div>
