<!-- The reaction's energy diagram (SIM-27): the reactant level at zero, the barrier at the
     forward activation energy E_f, and the product level at ΔE = E_f − E_r. The barrier and
     the product level can be dragged (mouse or touch) or moved with the arrow keys; the
     number fields beside the diagram set them exactly. -->
<script lang="ts">
  interface Props {
    /** kJ/mol. */
    forward: number;
    reverse: number;
    reactant: string;
    product: string;
    disabled?: boolean;
    onChange: (forward: number, reverse: number) => void;
  }

  let { forward, reverse, reactant, product, disabled = false, onChange }: Props = $props();

  const W = 240;
  const H = 150;
  const TOP = 14;
  const BOTTOM = H - 22;
  /** Energy scale, kJ/mol: fixed while dragging so the levels don't run away. */
  let dragging = $state<'barrier' | 'product' | null>(null);
  /** The levels' scale, kJ/mol, as last set while not dragging. */
  let lastScale = { min: -4, max: 16 };
  const scale = $derived.by(() => {
    if (dragging) return lastScale;
    // Room to drag a little past either level; it grows again after each drag.
    lastScale = {
      min: Math.floor(Math.min(0, forward - reverse) - 4),
      max: Math.max(16, Math.ceil(forward + 6)),
    };
    return lastScale;
  });
  const y = (e: number) => BOTTOM - ((e - scale.min) / (scale.max - scale.min)) * (BOTTOM - TOP);
  const energyAt = (py: number) =>
    scale.min + ((BOTTOM - py) / (BOTTOM - TOP)) * (scale.max - scale.min);

  const delta = $derived(forward - reverse);
  const y0 = $derived(y(0));
  const yBarrier = $derived(y(forward));
  const yProduct = $derived(y(delta));
  const path = $derived(
    `M 8 ${y0} L 64 ${y0} C 96 ${y0}, 100 ${yBarrier}, 120 ${yBarrier} ` +
      `C 140 ${yBarrier}, 144 ${yProduct}, 176 ${yProduct} L 232 ${yProduct}`,
  );

  const round = (e: number) => Math.round(e * 10) / 10;
  /** Moves the barrier (the product level stays): E_f changes, and E_r with it. */
  function setBarrier(e: number) {
    const f = round(Math.max(0, delta, Math.min(scale.max, e)));
    onChange(f, round(f - delta));
  }
  /** Moves the product level (the barrier stays): ΔE changes, so E_r does. */
  function setProduct(e: number) {
    const d = round(Math.min(forward, Math.max(scale.min, e)));
    onChange(forward, round(forward - d));
  }

  let svg: SVGSVGElement;
  function pointerEnergy(event: PointerEvent): number {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(svg.getScreenCTM()!.inverse());
    return energyAt(local.y);
  }
  function start(handle: 'barrier' | 'product', event: PointerEvent) {
    if (disabled) return;
    dragging = handle;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function move(event: PointerEvent) {
    if (!dragging) return;
    const e = pointerEnergy(event);
    if (dragging === 'barrier') setBarrier(e);
    else setProduct(e);
  }
  const end = () => (dragging = null);
  function key(handle: 'barrier' | 'product', event: KeyboardEvent) {
    const step = event.shiftKey ? 2 : 0.5;
    const by =
      event.key === 'ArrowUp' || event.key === 'ArrowRight'
        ? step
        : event.key === 'ArrowDown' || event.key === 'ArrowLeft'
          ? -step
          : 0;
    if (by === 0 || disabled) return;
    event.preventDefault();
    if (handle === 'barrier') setBarrier(forward + by);
    else setProduct(delta + by);
  }
  const fmt = (e: number) => e.toLocaleString('en-US', { maximumFractionDigits: 1 });
</script>

<svg
  bind:this={svg}
  viewBox="0 0 {W} {H}"
  class={['w-full touch-none select-none', disabled && 'opacity-60']}
  role="group"
  aria-label="Energy diagram: {reactant} at 0, barrier at {fmt(forward)} kJ/mol, {product} at {fmt(
    delta,
  )} kJ/mol"
  onpointermove={move}
  onpointerup={end}
  onpointercancel={end}
>
  <!-- Reaction path. -->
  <path d={path} fill="none" class="stroke-foreground" stroke-width="2" />
  <!-- E_f: reactant up to the barrier. -->
  <line
    x1="40"
    x2="40"
    y1={y0}
    y2={yBarrier}
    class="stroke-muted-foreground"
    stroke-dasharray="3 2"
  />
  <line x1="40" x2="120" y1={yBarrier} y2={yBarrier} class="stroke-border" stroke-dasharray="2 3" />
  <text x="44" y={(y0 + yBarrier) / 2 + 3} class="fill-muted-foreground text-[9px]">
    E<tspan baseline-shift="sub" class="text-[7px]">f</tspan>
    {fmt(forward)}
  </text>
  <!-- E_r: product up to the barrier. -->
  <line
    x1="204"
    x2="204"
    y1={yProduct}
    y2={yBarrier}
    class="stroke-muted-foreground"
    stroke-dasharray="3 2"
  />
  <line
    x1="120"
    x2="204"
    y1={yBarrier}
    y2={yBarrier}
    class="stroke-border"
    stroke-dasharray="2 3"
  />
  <text
    x="200"
    y={(yProduct + yBarrier) / 2 + 3}
    text-anchor="end"
    class="fill-muted-foreground text-[9px]"
  >
    E<tspan baseline-shift="sub" class="text-[7px]">r</tspan>
    {fmt(reverse)}
  </text>
  <!-- Level names. -->
  <text x="36" y={y0 + 12} text-anchor="middle" class="fill-foreground text-[9px]">{reactant}</text>
  <text x="204" y={yProduct + 12} text-anchor="middle" class="fill-foreground text-[9px]">
    {product}
  </text>
  <text x="232" y={yProduct - 4} text-anchor="end" class="fill-muted-foreground text-[8px]">
    ΔE {fmt(delta)}
  </text>
  <!-- Handles: large invisible targets for touch, a visible dot. -->
  {#each [{ handle: 'barrier', x: 120, py: yBarrier, label: 'Barrier (forward activation energy)', value: forward }, { handle: 'product', x: 176, py: yProduct, label: `${product} level (ΔE)`, value: delta }] as const as h (h.handle)}
    <g
      role="slider"
      tabindex={disabled ? -1 : 0}
      aria-label={h.label}
      aria-valuenow={h.value}
      aria-valuetext="{fmt(h.value)} kJ/mol"
      aria-valuemin={h.handle === 'barrier' ? Math.max(0, delta) : scale.min}
      aria-valuemax={h.handle === 'barrier' ? scale.max : forward}
      aria-disabled={disabled}
      class={[
        'focus-visible:outline-none [&:focus-visible>circle:last-child]:stroke-[3]',
        disabled ? 'cursor-not-allowed' : 'cursor-ns-resize',
      ]}
      onpointerdown={(e) => start(h.handle, e)}
      onkeydown={(e) => key(h.handle, e)}
    >
      <circle cx={h.x} cy={h.py} r="14" fill="transparent" />
      <circle
        cx={h.x}
        cy={h.py}
        r="5"
        class={['fill-primary stroke-background', dragging === h.handle && 'stroke-ring']}
        stroke-width="1.5"
      />
    </g>
  {/each}
</svg>
