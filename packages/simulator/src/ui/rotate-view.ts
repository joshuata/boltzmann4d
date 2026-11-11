// Svelte action for turning a 3D view: drag with a mouse, pen or finger, or hold the arrow
// keys while the canvas has focus (the Java app's controls: left/right turn about the
// vertical axis, up/down about the horizontal one, one degree per step).
import type { Action } from 'svelte/action';

/** Called with the angles to turn by, in degrees, about the x and y axes. */
export type Rotate = (aboutX: number, aboutY: number) => void;

/** Degrees per CSS pixel dragged. */
const DRAG_DEGREES_PER_PIXEL = 0.4;
/** A press that moves further than this (CSS pixels) is a drag, not a tap. */
const TAP_SLOP = 6;

/** Whether the latest press on `node` (with rotateView) was a drag rather than a tap. */
export const wasDragged = (node: HTMLElement) => node.dataset.dragged === 'true';

/** Degrees per arrow-key step (and key repeat). */
const KEY_DEGREES = 2;

export const rotateView: Action<HTMLElement, Rotate | null> = (node, initial) => {
  let rotate = initial;
  let dragging: { id: number; x: number; y: number; travelled: number } | null = null;

  const down = (event: PointerEvent) => {
    if (!rotate || dragging || (event.pointerType === 'mouse' && event.button !== 0)) return;
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, travelled: 0 };
    node.dataset.dragged = 'false';
    node.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (!rotate || dragging?.id !== event.pointerId) return;
    const dx = event.clientX - dragging.x;
    const dy = event.clientY - dragging.y;
    dragging.x = event.clientX;
    dragging.y = event.clientY;
    dragging.travelled += Math.hypot(dx, dy);
    if (dragging.travelled > TAP_SLOP) node.dataset.dragged = 'true';
    if (dx !== 0 || dy !== 0) {
      rotate(dy * DRAG_DEGREES_PER_PIXEL, dx * DRAG_DEGREES_PER_PIXEL);
    }
  };
  const up = (event: PointerEvent) => {
    if (dragging?.id === event.pointerId) dragging = null;
  };
  const key = (event: KeyboardEvent) => {
    if (!rotate) return;
    const step: Record<string, [number, number]> = {
      ArrowLeft: [0, -KEY_DEGREES],
      ArrowRight: [0, KEY_DEGREES],
      ArrowUp: [-KEY_DEGREES, 0],
      ArrowDown: [KEY_DEGREES, 0],
    };
    const turn = step[event.key];
    if (!turn) return;
    event.preventDefault();
    rotate(...turn);
  };

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);
  node.addEventListener('keydown', key);
  return {
    update(next) {
      rotate = next;
      if (!next) dragging = null;
    },
    destroy() {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
      node.removeEventListener('keydown', key);
    },
  };
};
