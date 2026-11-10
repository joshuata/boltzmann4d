<!--
  The drawing canvas (EDIT-9–12): the arena to scale in nm with a grid and rulers, its walls
  and spawn regions, and the tools that draw, select and move them. SVG elements, so shapes
  can be focused, named for screen readers and hit-tested by the browser; drawn with y up,
  like the arena.

  Mouse and touch: drag to draw segments and rectangles, click (tap) points for polygons,
  drag shapes or their point handles to move them, drag on empty space for a selection
  rectangle, wheel or pinch to zoom, middle button or two fingers to pan. Alt (Option) turns
  snapping off while held. Keyboard shortcuts are in the toolbar's tooltips.
-->
<script lang="ts">
  import { paletteColor, wallStyle } from '@boltzmann4d/engine/scenario';
  import type { EditorState } from './editor.svelte';
  import {
    allInside,
    clampPoint,
    distanceToPolyline,
    gridStep,
    rectangle,
    rectangleCorners,
    round,
    snapPoint,
    type Point,
  } from './geometry';
  import {
    addRegion,
    addWall,
    deleteShapes,
    describeShape,
    fillsOf,
    movePoint,
    moveShapes,
    regionKey,
    shapePoints,
    wallKey,
    type SelectionKey,
  } from './scenario-ops';

  interface Props {
    editor: EditorState;
  }

  let { editor }: Props = $props();

  // Layout: the SVG fills its box; the view maps nm to pixels.
  let width = $state(0);
  let height = $state(0);
  let svg: SVGSVGElement;
  const MARGIN = 36; // px, room for the rulers
  let view = $state({ scale: 10, ox: 0, oy: 0 });
  let fittedTo = '';

  const scenario = $derived(editor.scenario);
  const arena = $derived({ w: scenario.arena.size[0], h: scenario.arena.size[1] });
  const is2D = $derived(scenario.arena.dimensions === 2);

  function fit() {
    if (width <= 0 || height <= 0) return;
    const scale = Math.min((width - 2 * MARGIN) / arena.w, (height - 2 * MARGIN) / arena.h);
    view = {
      scale,
      ox: (width - arena.w * scale) / 2,
      oy: height - (height - arena.h * scale) / 2,
    };
  }
  // Fit when the box first has a size and whenever the arena's size changes.
  $effect(() => {
    const key = `${arena.w}x${arena.h}`;
    if (width > 0 && height > 0 && key !== fittedTo) {
      fittedTo = key;
      fit();
    }
  });

  const toScreen = ([x, y]: Point): Point => [x * view.scale + view.ox, view.oy - y * view.scale];
  function toNm(clientX: number, clientY: number): Point {
    const box = svg.getBoundingClientRect();
    return [
      (clientX - box.left - view.ox) / view.scale,
      (view.oy - (clientY - box.top)) / view.scale,
    ];
  }

  const grid = $derived(gridStep(view.scale));
  const px = (pixels: number) => pixels / view.scale; // pixels in nm

  // ----- Snapping -----

  /** Points to snap onto: every wall point and region corner except those of `skip`. */
  function snapTargets(skip: SelectionKey[] = []): Point[] {
    const points: Point[] = [];
    for (const wall of scenario.walls) {
      if (!skip.includes(wallKey(wall.id))) points.push(...wall.points);
    }
    for (const region of scenario.spawnRegions) {
      if (skip.includes(regionKey(region.id))) continue;
      const shape = region.shape;
      points.push(...(shape.type === 'rectangle' ? rectangleCorners(shape.min, shape.max) : shape.points)); // prettier-ignore
    }
    // The arena's corners.
    points.push(...rectangleCorners([0, 0], [arena.w, arena.h]));
    return points;
  }

  function snap(p: Point, event: { altKey: boolean }, anchor?: Point, skip?: SelectionKey[]) {
    const clamped = clampPoint(p, arena.w, arena.h);
    if (!editor.snapping || event.altKey) return clampPoint([round(p[0]), round(p[1])], arena.w, arena.h); // prettier-ignore
    return clampPoint(
      snapPoint(clamped, { grid, points: snapTargets(skip), anchor, tolerance: px(8) }),
      arena.w,
      arena.h,
    );
  }

  // ----- Drawing state -----

  type Gesture =
    | { type: 'pan'; x: number; y: number; ox: number; oy: number }
    | { type: 'move'; start: Point; first: Point; keys: SelectionKey[]; moved: boolean }
    | { type: 'point'; key: SelectionKey; index: number; moved: boolean }
    | { type: 'marquee'; a: Point; b: Point; add: boolean }
    | { type: 'drag-draw'; a: Point; b: Point };

  let gesture = $state.raw<Gesture | null>(null);
  /** Points of the polygon being drawn, and where the pointer is. */
  let draft = $state.raw<Point[]>([]);
  let cursor = $state.raw<Point | null>(null);
  // Pointers down, for pinching; read only in handlers, so not reactive.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { distance: number; mid: { x: number; y: number }; scale: number } | null = null;

  const drawsPolygon = $derived(editor.tool === 'polygon' || editor.tool === 'region-polygon');
  const drawsDrag = $derived(
    editor.tool === 'segment' || editor.tool === 'rectangle' || editor.tool === 'region-rectangle',
  );

  // Changing tools drops a half-drawn polygon.
  $effect(() => {
    void editor.tool;
    draft = [];
  });

  function onPointerDown(event: PointerEvent) {
    if (!is2D) return;
    svg.focus({ preventScroll: true });
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    svg.setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
      // Two fingers: pinch to zoom and pan; whatever one finger started is dropped.
      if (gesture?.type === 'move' || gesture?.type === 'point') editor.cancelGesture(!gesture.moved); // prettier-ignore
      gesture = null;
      const [a, b] = [...pointers.values()];
      pinch = {
        distance: Math.hypot(a!.x - b!.x, a!.y - b!.y),
        mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 },
        scale: view.scale,
      };
      return;
    }
    if (pointers.size > 2) return;
    if (event.button === 1 || (event.button === 0 && spaceHeld)) {
      gesture = { type: 'pan', x: event.clientX, y: event.clientY, ox: view.ox, oy: view.oy };
      return;
    }
    if (event.button !== 0) return;
    const p = toNm(event.clientX, event.clientY);

    if (drawsDrag) {
      const a = snap(p, event);
      gesture = { type: 'drag-draw', a, b: a };
      return;
    }
    if (drawsPolygon) {
      addDraftPoint(p, event);
      return;
    }

    // Select tool: a handle, then a shape, then empty space.
    const handle = handleAt(p);
    if (handle) {
      editor.beginGesture();
      gesture = { type: 'point', key: handle.key, index: handle.index, moved: false };
      return;
    }
    const hit = shapeAt(p);
    if (hit) {
      if (event.shiftKey) {
        editor.toggle(hit);
        return;
      }
      if (!editor.selection.includes(hit)) editor.select([hit]);
      editor.beginGesture();
      const first = shapePoints(editor.scenario, editor.selection[0]!)[0] ?? p;
      gesture = { type: 'move', start: p, first, keys: [...editor.selection], moved: false };
      return;
    }
    gesture = { type: 'marquee', a: p, b: p, add: event.shiftKey };
  }

  function onPointerMove(event: PointerEvent) {
    if (pointers.has(event.pointerId)) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      zoomAt(pinch.mid.x, pinch.mid.y, (pinch.scale * distance) / pinch.distance / view.scale);
      view = { ...view, ox: view.ox + mid.x - pinch.mid.x, oy: view.oy + mid.y - pinch.mid.y };
      pinch = { ...pinch, mid, scale: pinch.scale };
      return;
    }
    const p = toNm(event.clientX, event.clientY);
    cursor = drawsPolygon ? snap(p, event, draft.at(-1)) : p;
    if (!gesture) return;
    switch (gesture.type) {
      case 'pan':
        view = {
          ...view,
          ox: gesture.ox + event.clientX - gesture.x,
          oy: gesture.oy + event.clientY - gesture.y,
        };
        break;
      case 'drag-draw':
        gesture = {
          ...gesture,
          b: snap(p, event, editor.tool === 'segment' ? gesture.a : undefined),
        };
        break;
      case 'marquee':
        gesture = { ...gesture, b: p };
        break;
      case 'point': {
        const points = shapePoints(editor.scenario, gesture.key);
        const anchor = points.length > 1 ? points[gesture.index === 0 ? 1 : gesture.index - 1] : undefined; // prettier-ignore
        const to = snap(p, event, anchor, [gesture.key]);
        editor.updateGesture(movePoint(editor.scenario, gesture.key, gesture.index, to));
        gesture = { ...gesture, moved: true };
        break;
      }
      case 'move': {
        // Snap the first shape's first point; everything moves with it.
        const target = snap(
          [gesture.first[0] + p[0] - gesture.start[0], gesture.first[1] + p[1] - gesture.start[1]],
          event,
          undefined,
          gesture.keys,
        );
        const current = shapePoints(editor.scenario, gesture.keys[0]!)[0] ?? gesture.first;
        const dx = target[0] - current[0];
        const dy = target[1] - current[1];
        if (dx !== 0 || dy !== 0) {
          editor.updateGesture(moveShapes(editor.scenario, gesture.keys, dx, dy));
          gesture = { ...gesture, moved: true };
        }
        break;
      }
    }
  }

  function onPointerUp(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      return;
    }
    if (!gesture) return;
    const done = gesture;
    gesture = null;
    switch (done.type) {
      case 'drag-draw':
        finishDrag(done.a, done.b);
        break;
      case 'marquee': {
        const tiny = Math.hypot(done.b[0] - done.a[0], done.b[1] - done.a[1]) < px(4);
        if (tiny) {
          if (!done.add) editor.select([]);
          break;
        }
        const keys = allKeys().filter((key) =>
          allInside(shapePoints(editor.scenario, key), done.a, done.b),
        );
        editor.select(keys, done.add);
        break;
      }
      case 'move':
      case 'point':
        editor.cancelGesture(!done.moved);
        break;
    }
  }

  function finishDrag(a: Point, b: Point) {
    const tool = editor.tool;
    if (tool === 'segment') {
      if (a[0] === b[0] && a[1] === b[1]) return;
      created(addWall(editor.scenario, [a, b], false));
      return;
    }
    const { min, max } = rectangle(a, b);
    if (!(min[0] < max[0] && min[1] < max[1])) return;
    if (tool === 'rectangle') created(addWall(editor.scenario, rectangleCorners(min, max), true));
    else created(addRegion(editor.scenario, { type: 'rectangle', min, max }));
  }

  function addDraftPoint(p: Point, event: { altKey: boolean; pointerType?: string }) {
    const first = draft[0];
    // Clicking (tapping) the first point again closes the polygon; fingers get more room.
    const reach = px(event.pointerType === 'touch' ? 20 : 12);
    if (first && draft.length >= 3 && Math.hypot(p[0] - first[0], p[1] - first[1]) <= reach) {
      finishPolygon(true);
      return;
    }
    const point = snap(p, event, draft.at(-1));
    const last = draft.at(-1);
    if (last && last[0] === point[0] && last[1] === point[1]) return;
    draft = [...draft, point];
  }

  /** Ends the polygon being drawn: closed, or (walls only) open. */
  function finishPolygon(closed: boolean) {
    const points = draft;
    draft = [];
    if (editor.tool === 'region-polygon') {
      if (points.length >= 3) created(addRegion(editor.scenario, { type: 'polygon', points }));
      return;
    }
    if (points.length >= (closed ? 3 : 2)) created(addWall(editor.scenario, points, closed));
  }

  function created(result: { scenario: typeof editor.scenario; key: SelectionKey }) {
    editor.edit(result.scenario);
    editor.select([result.key]);
    editor.announcement = `Added ${describeShape(result.scenario, result.key)}`;
  }

  // ----- Hit testing -----

  function allKeys(): SelectionKey[] {
    return [
      ...scenario.walls.map((w) => wallKey(w.id)),
      ...scenario.spawnRegions.map((r) => regionKey(r.id)),
    ];
  }

  /** The topmost shape under p: walls (drawn above regions) first. */
  function shapeAt(p: Point): SelectionKey | null {
    for (const wall of [...scenario.walls].reverse()) {
      if (distanceToPolyline(p, wall.points, wall.closed) <= px(8)) return wallKey(wall.id);
    }
    for (const region of [...scenario.spawnRegions].reverse()) {
      const shape = region.shape;
      const points =
        shape.type === 'rectangle' ? rectangleCorners(shape.min, shape.max) : shape.points;
      if (insideOrOn(p, points)) return regionKey(region.id);
    }
    return null;
  }

  function insideOrOn(p: Point, points: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i]!;
      const [xj, yj] = points[j]!;
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside || distanceToPolyline(p, points, true) <= px(6);
  }

  function handleAt(p: Point): { key: SelectionKey; index: number } | null {
    for (const key of editor.selection) {
      const points = shapePoints(scenario, key);
      for (let index = 0; index < points.length; index++) {
        const q = points[index]!;
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= px(9)) return { key, index };
      }
    }
    return null;
  }

  // ----- Zoom and keyboard -----

  function zoomAt(clientX: number, clientY: number, factor: number) {
    const box = svg.getBoundingClientRect();
    const sx = clientX - box.left;
    const sy = clientY - box.top;
    const fitScale = Math.min((width - 2 * MARGIN) / arena.w, (height - 2 * MARGIN) / arena.h);
    const scale = Math.min(Math.max(view.scale * factor, fitScale / 4), fitScale * 50);
    const k = scale / view.scale;
    view = { scale, ox: sx - (sx - view.ox) * k, oy: sy - (sy - view.oy) * k };
  }

  // Wheel listeners must not be passive, to keep the page from scrolling while zooming.
  $effect(() => {
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || !event.shiftKey) {
        zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.0015));
      } else {
        view = { ...view, ox: view.ox - event.deltaX - event.deltaY };
      }
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  });

  let spaceHeld = false;

  const TOOL_KEYS: Record<string, typeof editor.tool> = {
    v: 'select',
    l: 'segment',
    r: 'rectangle',
    p: 'polygon',
    s: 'region-rectangle',
    g: 'region-polygon',
  };

  /** Shortcuts while the canvas has focus (EDIT-21). */
  function onKeyDown(event: KeyboardEvent) {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) editor.redo();
      else editor.undo();
      return;
    }
    if (mod && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      editor.redo();
      return;
    }
    if (mod) return;
    const tool = TOOL_KEYS[event.key.toLowerCase()];
    if (tool) {
      editor.tool = tool;
      return;
    }
    switch (event.key) {
      case ' ':
        spaceHeld = true;
        event.preventDefault();
        return;
      case 'Escape':
        if (draft.length > 0) draft = [];
        else if (gesture?.type === 'drag-draw') gesture = null;
        else editor.select([]);
        return;
      case 'Enter':
        if (drawsPolygon && draft.length > 0) {
          event.preventDefault();
          finishPolygon(editor.tool === 'region-polygon');
        }
        return;
      case 'Delete':
      case 'Backspace':
        if (draft.length > 0) {
          draft = draft.slice(0, -1);
        } else if (editor.selection.length > 0) {
          event.preventDefault();
          editor.edit(deleteShapes(editor.scenario, editor.selection));
          editor.announcement = 'Deleted';
        }
        return;
      case '+':
      case '=':
        zoomCentre(1.25);
        return;
      case '-':
        zoomCentre(0.8);
        return;
      case '0':
        fit();
        return;
    }
    const arrows: Record<string, Point> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const arrow = arrows[event.key];
    if (!arrow) return;
    event.preventDefault();
    if (editor.selection.length > 0) {
      // Nudge by a grid step (Shift: five).
      const step = grid * (event.shiftKey ? 5 : 1);
      editor.edit(
        moveShapes(editor.scenario, editor.selection, arrow[0] * step, arrow[1] * step),
        'nudge',
      );
    } else {
      view = { ...view, ox: view.ox - arrow[0] * 40, oy: view.oy + arrow[1] * 40 };
    }
  }

  function zoomCentre(factor: number) {
    const box = svg.getBoundingClientRect();
    zoomAt(box.left + width / 2, box.top + height / 2, factor);
  }

  // ----- Drawing helpers -----

  const hex = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`;
  const kindColor = (kindId: string) => {
    const index = scenario.kinds.findIndex((k) => k.id === kindId);
    const kind = scenario.kinds[index];
    return kind?.color ?? hex(paletteColor(scenario.display.palette, index) ?? 0xffffff);
  };
  const path = (points: Point[]) => points.map((p) => toScreen(p).join(',')).join(' ');
  const regionPoints = (shape: (typeof scenario.spawnRegions)[number]['shape']) =>
    shape.type === 'rectangle' ? rectangleCorners(shape.min, shape.max) : shape.points;

  /** Ruler ticks: every fifth grid line, labelled. */
  const ticks = $derived.by(() => {
    const major = grid * 5;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let x = 0; x <= arena.w + 1e-9; x += major) xs.push(round(x));
    for (let y = 0; y <= arena.h + 1e-9; y += major) ys.push(round(y));
    return { xs, ys };
  });

  const gridLines = $derived.by(() => {
    const lines: { a: Point; b: Point; major: boolean }[] = [];
    if (grid * view.scale < 6) return lines;
    for (let k = 1; k * grid < arena.w - 1e-9; k++) {
      lines.push({ a: [k * grid, 0], b: [k * grid, arena.h], major: k % 5 === 0 });
    }
    for (let k = 1; k * grid < arena.h - 1e-9; k++) {
      lines.push({ a: [0, k * grid], b: [arena.w, k * grid], major: k % 5 === 0 });
    }
    return lines;
  });

  const divider = $derived.by(() => {
    const boundary = scenario.arena.boundary;
    if (boundary !== 'DIVIDED' && boundary !== 'HOLE') return null;
    const x = arena.w / 2;
    if (boundary === 'DIVIDED')
      return [
        [
          [x, 0],
          [x, arena.h],
        ],
      ] as [Point, Point][];
    const half = scenario.arena.holeSize / 2;
    return [
      [
        [x, 0],
        [x, arena.h / 2 - half],
      ],
      [
        [x, arena.h / 2 + half],
        [x, arena.h],
      ],
    ] as [Point, Point][];
  });
</script>

{#snippet line(
  closed: boolean,
  points: string,
  stroke: string,
  strokeWidth: number,
  dash: string | undefined,
  opacity = 1,
)}
  {#if closed}
    <polygon
      {points}
      fill="none"
      {stroke}
      stroke-opacity={opacity}
      stroke-width={strokeWidth}
      stroke-dasharray={dash}
      stroke-linejoin="round"
    />
  {:else}
    <polyline
      {points}
      fill="none"
      {stroke}
      stroke-opacity={opacity}
      stroke-width={strokeWidth}
      stroke-dasharray={dash}
      stroke-linejoin="round"
      stroke-linecap="round"
    />
  {/if}
{/snippet}

<div
  class="relative h-full w-full overflow-hidden bg-neutral-200 dark:bg-neutral-900"
  bind:clientWidth={width}
  bind:clientHeight={height}
>
  <!-- An application region with its own keyboard handling (EDIT-21); Svelte doesn't count
       role="application" as interactive. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <svg
    bind:this={svg}
    {width}
    {height}
    class={[
      'block touch-none outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
      drawsDrag || drawsPolygon ? 'cursor-crosshair' : 'cursor-default',
    ]}
    role="application"
    aria-label="Arena, {arena.w} by {arena.h} nanometres. Tools: V select, L segment, R rectangle, P polygon, S spawn rectangle, G spawn polygon."
    tabindex="0"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onpointerleave={() => (cursor = null)}
    onkeydown={onKeyDown}
    onkeyup={(e) => {
      if (e.key === ' ') spaceHeld = false;
    }}
    ondblclick={() => {
      if (drawsPolygon && draft.length > 0) finishPolygon(editor.tool === 'region-polygon');
    }}
  >
    <!-- The arena, black as in the simulator, with its grid. -->
    <rect
      x={view.ox}
      y={view.oy - arena.h * view.scale}
      width={arena.w * view.scale}
      height={arena.h * view.scale}
      fill="#000"
    />
    {#each gridLines as line, i (i)}
      <line
        x1={toScreen(line.a)[0]}
        y1={toScreen(line.a)[1]}
        x2={toScreen(line.b)[0]}
        y2={toScreen(line.b)[1]}
        stroke="#fff"
        stroke-opacity={line.major ? 0.16 : 0.07}
        stroke-width="1"
      />
    {/each}
    <rect
      x={view.ox}
      y={view.oy - arena.h * view.scale}
      width={arena.w * view.scale}
      height={arena.h * view.scale}
      fill="none"
      stroke="#fff"
      stroke-width="1.5"
    />
    {#if divider}
      {#each divider as [a, b], i (i)}
        <line
          x1={toScreen(a)[0]}
          y1={toScreen(a)[1]}
          x2={toScreen(b)[0]}
          y2={toScreen(b)[1]}
          stroke="#fff"
          stroke-width="3"
        />
      {/each}
    {/if}

    <!-- Rulers, in nm (EDIT-9). -->
    <g class="fill-muted-foreground text-[10px] tabular-nums" aria-hidden="true">
      {#each ticks.xs as x (x)}
        <text x={toScreen([x, 0])[0]} y={view.oy + 14} text-anchor="middle">{x}</text>
      {/each}
      {#each ticks.ys as y (y)}
        <text x={view.ox - 6} y={toScreen([0, y])[1] + 3} text-anchor="end">{y}</text>
      {/each}
      <text x={view.ox + arena.w * view.scale} y={view.oy + 26} text-anchor="end">nm</text>
    </g>

    {#if is2D}
      <!-- Spawn regions: tinted with their first fill's kind, dashed outline, named. -->
      {#each scenario.spawnRegions as region (region.id)}
        {@const key = regionKey(region.id)}
        {@const points = regionPoints(region.shape)}
        {@const fills = fillsOf(scenario, region.id)}
        {@const color = fills[0] ? kindColor(fills[0].kind) : '#888'}
        {@const selected = editor.selection.includes(key)}
        <g
          role="button"
          tabindex="0"
          aria-label={describeShape(scenario, key)}
          aria-pressed={selected}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              if (e.shiftKey) editor.toggle(key);
              else editor.select([key]);
            }
          }}
          class="outline-none focus-visible:[&>polygon]:stroke-[3]"
        >
          <polygon
            points={path(points)}
            fill={color}
            fill-opacity="0.16"
            stroke={selected ? 'var(--ring)' : color}
            stroke-width={selected ? 2 : 1.5}
            stroke-dasharray="6 4"
          />
          <text
            x={toScreen(points[0]!)[0] + 4}
            y={toScreen(points[0]!)[1] - 4}
            fill={color}
            class="text-[11px] font-medium"
            aria-hidden="true"
          >
            {region.name ?? region.id} · {fills.reduce(
              (n, p) => n + p.randomlyPlaced.reduce((m, b) => m + b.count, 0),
              0,
            )}
          </text>
        </g>
      {/each}

      <!-- Walls, in their style (WALL-5). -->
      {#each scenario.walls as wall (wall.id)}
        {@const key = wallKey(wall.id)}
        {@const style = wallStyle(wall.kind.type, wall.style)}
        {@const selected = editor.selection.includes(key)}
        {@const points = path(wall.points)}
        <g
          role="button"
          tabindex="0"
          aria-label={describeShape(scenario, key)}
          aria-pressed={selected}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              if (e.shiftKey) editor.toggle(key);
              else editor.select([key]);
            }
          }}
          class="group outline-none"
        >
          {#if selected}
            {@render line(wall.closed, points, 'var(--ring)', style.lineWidth + 8, undefined, 0.45)}
          {/if}
          {@render line(
            wall.closed,
            points,
            hex(style.color),
            style.lineWidth,
            style.dash === 'dashed' ? '8 6' : undefined,
          )}
          {#if wall.kind.type === 'thermal'}
            <text
              x={toScreen(wall.points[0]!)[0] + 6}
              y={toScreen(wall.points[0]!)[1] - 6}
              fill={hex(style.color)}
              class="text-[11px] font-medium"
              aria-hidden="true">{wall.kind.temperature} K</text
            >
          {/if}
        </g>
      {/each}

      <!-- Handles on the selected shapes' points (EDIT-12). -->
      {#each editor.selection as key (key)}
        {#each shapePoints(scenario, key) as point, i (i)}
          <circle
            cx={toScreen(point)[0]}
            cy={toScreen(point)[1]}
            r="5"
            fill="#fff"
            stroke="var(--ring)"
            stroke-width="2"
            aria-hidden="true"
          />
        {/each}
      {/each}

      <!-- What's being drawn. -->
      {#if gesture?.type === 'drag-draw'}
        {#if editor.tool === 'segment'}
          <polyline
            points={path([gesture.a, gesture.b])}
            stroke="#fff"
            stroke-width="2"
            stroke-dasharray="4 3"
          />
        {:else}
          {@const r = rectangle(gesture.a, gesture.b)}
          <polygon
            points={path(rectangleCorners(r.min, r.max))}
            fill={editor.tool === 'region-rectangle' ? '#fff' : 'none'}
            fill-opacity="0.1"
            stroke="#fff"
            stroke-width="2"
            stroke-dasharray="4 3"
          />
        {/if}
      {/if}
      {#if draft.length > 0}
        <polyline
          points={path(cursor ? [...draft, cursor] : draft)}
          fill="none"
          stroke="#fff"
          stroke-width="2"
          stroke-dasharray="4 3"
        />
        {#each draft as point, i (i)}
          <circle cx={toScreen(point)[0]} cy={toScreen(point)[1]} r={i === 0 ? 6 : 4} fill="#fff" />
        {/each}
      {/if}
      {#if gesture?.type === 'marquee'}
        {@const r = rectangle(gesture.a, gesture.b)}
        <polygon
          points={path(rectangleCorners(r.min, r.max))}
          fill="var(--ring)"
          fill-opacity="0.12"
          stroke="var(--ring)"
          stroke-dasharray="4 3"
        />
      {/if}
    {/if}
  </svg>

  {#if !is2D}
    <p class="bg-background/90 absolute inset-x-4 top-4 rounded-md p-3 text-sm">
      Walls and spawn regions are drawn in 2D. {scenario.arena.dimensions}D scenarios use the box,
      divider and hole; set them up in the Arena panel.
    </p>
  {:else if drawsPolygon && draft.length > 0}
    <p
      class="bg-background/90 text-muted-foreground absolute bottom-3 left-3 rounded-md px-2 py-1 text-xs"
    >
      {editor.tool === 'polygon'
        ? 'Click the first point to close, double-click or Enter to finish open, Esc to cancel'
        : 'Click the first point, double-click or Enter to close, Esc to cancel'}
    </p>
  {/if}
</div>
