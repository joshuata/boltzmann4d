import { describe, expect, it } from 'vitest';
import { EventHeap, INTERNAL_ROW } from './event-heap';
import { seededRandom } from './scenes';

describe('EventHeap', () => {
  it('orders by time, then row, then column, then particle (Java tie order)', () => {
    const heap = new EventHeap(5);
    heap.set(0, 2, 3, 1); // later
    heap.set(1, 1, INTERNAL_ROW, 1); // crossing: last among equal times
    heap.set(2, 1, 4, 0); // pair (0, 4)
    heap.set(3, 1, 0, 3); // boundary event of particle 3: boundary row first
    heap.set(4, 1, 4, 0); // same pair as particle 2
    const order: number[] = [];
    for (let k = 0; k < 5; k++) {
      const top = heap.peek();
      order.push(top);
      heap.set(top, Infinity, 0, 0); // push it to the back
    }
    expect(order).toEqual([3, 2, 4, 1, 0]);
  });

  it('keeps the minimum correct under random re-keying', () => {
    const n = 200;
    const random = seededRandom(3);
    const heap = new EventHeap(n);
    const time = new Float64Array(n);
    for (let i = 0; i < n; i++) heap.set(i, (time[i] = Math.floor(random() * 50)), 1, i);
    for (let step = 0; step < 20000; step++) {
      const i = Math.floor(random() * n);
      heap.set(i, (time[i] = Math.floor(random() * 50)), 1, i);
      const expected = time.indexOf(Math.min(...time)); // lowest index wins ties (col = i)
      expect(heap.peek()).toBe(expected);
      expect(heap.peekTime()).toBe(time[expected]);
    }
  });

  it('compares a candidate key against a particle (keyBefore)', () => {
    const heap = new EventHeap(1);
    heap.set(0, 5, 3, 2);
    expect(heap.keyBefore(4, 9, 9, 0)).toBe(true);
    expect(heap.keyBefore(5, 2, 9, 0)).toBe(true);
    expect(heap.keyBefore(5, 3, 1, 0)).toBe(true);
    expect(heap.keyBefore(5, 3, 2, 0)).toBe(false);
    expect(heap.keyBefore(6, 0, 0, 0)).toBe(false);
  });
});
