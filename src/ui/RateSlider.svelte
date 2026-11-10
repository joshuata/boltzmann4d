<!-- Scales how fast simulated time runs, from MIN_SCALE× to MAX_SCALE× the preset's speed.
     The slider is logarithmic so 1× sits in the middle; double-click it to reset to 1×. -->
<script lang="ts">
  interface Props {
    value: number;
    disabled?: boolean;
    onChange: (scale: number) => void;
  }

  let { value, disabled = false, onChange }: Props = $props();

  const MIN_SCALE = 0.1;
  const MAX_SCALE = 10;

  const exponent = $derived(Math.log10(value));

  function format(scale: number): string {
    if (scale < 1) return scale.toFixed(2);
    if (scale < 10) return scale.toFixed(1);
    return scale.toFixed(0);
  }
</script>

<label class="rate">
  <span class="heading">
    <span>Speed</span>
    <output>{format(value)}×</output>
  </span>
  <input
    type="range"
    min={Math.log10(MIN_SCALE)}
    max={Math.log10(MAX_SCALE)}
    step="0.01"
    value={exponent}
    {disabled}
    list="rate-ticks"
    aria-valuetext="{format(value)} times"
    title="Double-click to reset to 1×"
    oninput={(event) => onChange(10 ** Number((event.currentTarget as HTMLInputElement).value))}
    ondblclick={() => onChange(1)}
  />
  <datalist id="rate-ticks">
    <option value="-1"></option>
    <option value="0"></option>
    <option value="1"></option>
  </datalist>
  <span class="scale" aria-hidden="true">
    <span>{MIN_SCALE}×</span>
    <span>1×</span>
    <span>{MAX_SCALE}×</span>
  </span>
</label>

<style>
  .rate {
    display: grid;
    gap: 0.25rem;
    margin: 0.75rem 0;
    font-size: 0.85rem;
  }
  .heading,
  .scale {
    display: flex;
    justify-content: space-between;
  }
  output {
    font-variant-numeric: tabular-nums;
  }
  input {
    width: 100%;
    margin: 0;
    /* Bigger touch target on phones and tablets. */
    min-height: 1.75rem;
    accent-color: var(--focus-ring);
  }
  .scale {
    font-size: 0.7rem;
    opacity: 0.6;
  }
</style>
