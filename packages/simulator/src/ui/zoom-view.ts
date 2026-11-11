// Svelte action for zooming the arena (CTRL-7): pinch with two fingers, the mouse wheel or
// a trackpad pinch, or the +, - and 0 keys while the canvas has focus. It works alongside
// rotate-view.ts (one finger turns a 3D view, two pinch) and leaves taps alone: a click
// right after a pinch is swallowed, so lifting the fingers doesn't toggle the hole.
import type { Action } from 'svelte/action';
import { stepZoom } from './zoom';

/** Applies a change to the zoom: called with a function from the current zoom to the new one. */
export type UpdateZoom = (update: (zoom: number) => number) => void;

/** How strongly the wheel zooms: a factor of e per this many pixels scrolled. */
const WHEEL_PIXELS = 500;
/** Trackpad pinches arrive as ctrl+wheel with small deltas; scale them up. */
const PINCH_PIXELS = 100;
/** How long after a pinch ends a click is taken to be part of it, ms. */
const CLICK_AFTER_PINCH_MS = 400;

export const zoomView: Action<HTMLElement, UpdateZoom | null> = (node, initial) => {
  let update = initial;
  /** Pointers down on the canvas, by id. */
  const pointers = new Map<number, { x: number; y: number }>();
  /** Distance between the two pinching pointers at the last move, CSS px. */
  let spread = 0;
  let pinchEndedAt = -Infinity;
  /** Safari's trackpad pinch (gesture events): the scale at the last change. */
  let gestureScale = 1;

  const zoomBy = (factor: number) => {
    if (factor > 0 && Number.isFinite(factor) && factor !== 1) update?.((zoom) => zoom * factor);
  };
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  // Two fingers are needed to pinch; the browser mustn't scroll or zoom the page instead.
  const previousTouchAction = node.style.touchAction;
  node.style.touchAction = 'none';

  const down = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') return; // a mouse can't pinch
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) spread = distance();
  };
  const move = (event: PointerEvent) => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (pointers.size !== 2) return;
    const next = distance();
    if (spread > 0 && next > 0) zoomBy(next / spread);
    spread = next;
  };
  const up = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return;
    if (pointers.size === 1) pinchEndedAt = performance.now();
    if (pointers.size < 2) spread = 0;
  };
  const click = (event: MouseEvent) => {
    if (pointers.size > 1 || performance.now() - pinchEndedAt < CLICK_AFTER_PINCH_MS) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  };
  const wheel = (event: WheelEvent) => {
    if (!update) return;
    event.preventDefault();
    const pixels = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
    const scale = event.ctrlKey ? PINCH_PIXELS : WHEEL_PIXELS;
    zoomBy(Math.exp((-event.deltaY * pixels) / scale));
  };
  // Safari (macOS) reports trackpad pinches as gesture events rather than ctrl+wheel.
  const gestureStart = (event: Event) => {
    event.preventDefault();
    gestureScale = 1;
  };
  const gestureChange = (event: Event) => {
    event.preventDefault();
    const scale = (event as Event & { scale?: number }).scale ?? 1;
    zoomBy(scale / gestureScale);
    gestureScale = scale;
  };
  const key = (event: KeyboardEvent) => {
    if (!update || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === '+' || event.key === '=') update((zoom) => stepZoom(zoom, 1));
    else if (event.key === '-' || event.key === '_') update((zoom) => stepZoom(zoom, -1));
    else if (event.key === '0') update(() => 1);
    else return;
    event.preventDefault();
  };

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);
  // Capture, so the click is stopped before the canvas's own handler sees it.
  node.addEventListener('click', click, { capture: true });
  node.addEventListener('wheel', wheel, { passive: false });
  node.addEventListener('gesturestart', gestureStart);
  node.addEventListener('gesturechange', gestureChange);
  node.addEventListener('keydown', key);
  return {
    update(next) {
      update = next;
    },
    destroy() {
      node.style.touchAction = previousTouchAction;
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
      node.removeEventListener('click', click, { capture: true });
      node.removeEventListener('wheel', wheel);
      node.removeEventListener('gesturestart', gestureStart);
      node.removeEventListener('gesturechange', gestureChange);
      node.removeEventListener('keydown', key);
    },
  };
};
