// Indexed binary min-heap of particles, keyed by each particle's next event (plan 0003).
//
// Keys compare by time, then by Java's calendar order for ties: the boundary row (row 0)
// first, then the pair's higher particle index (Java's row), then the lower one (column).
// Internal events (cell crossings) use row = INTERNAL_ROW so they sort after real events
// at the same time. Equal keys fall back to the particle index, so the order is total.

/** Row used for internal events (cell crossings): after every real event at the same time. */
export const INTERNAL_ROW = 0x7fffffff;

export class EventHeap {
  /** Key of each particle's next event. Write via set(); read freely. */
  readonly time: Float64Array;
  readonly row: Int32Array;
  readonly col: Int32Array;

  private readonly heap: Int32Array; // heap slot -> particle
  private readonly slot: Int32Array; // particle -> heap slot
  private size = 0;

  constructor(count: number) {
    this.time = new Float64Array(count);
    this.row = new Int32Array(count);
    this.col = new Int32Array(count);
    this.heap = new Int32Array(count);
    this.slot = new Int32Array(count).fill(-1);
  }

  /** Inserts or re-keys particle i. */
  set(i: number, time: number, row: number, col: number): void {
    this.time[i] = time;
    this.row[i] = row;
    this.col[i] = col;
    let s = this.slot[i]!;
    if (s < 0) {
      s = this.size++;
      this.heap[s] = i;
      this.slot[i] = s;
    }
    this.siftDown(this.siftUp(s));
  }

  /** Particle with the soonest event, or -1 if empty. */
  peek(): number {
    return this.size > 0 ? this.heap[0]! : -1;
  }

  /** Time of the soonest event, or Infinity if empty. */
  peekTime(): number {
    return this.size > 0 ? this.time[this.heap[0]!]! : Infinity;
  }

  /** True if particle a's key sorts before b's. */
  before(a: number, b: number): boolean {
    const ta = this.time[a]!;
    const tb = this.time[b]!;
    if (ta !== tb) return ta < tb;
    const ra = this.row[a]!;
    const rb = this.row[b]!;
    if (ra !== rb) return ra < rb;
    const ca = this.col[a]!;
    const cb = this.col[b]!;
    if (ca !== cb) return ca < cb;
    return a < b;
  }

  /** True if (time, row, col) sorts before particle b's current key. */
  keyBefore(time: number, row: number, col: number, b: number): boolean {
    const tb = this.time[b]!;
    if (time !== tb) return time < tb;
    const rb = this.row[b]!;
    if (row !== rb) return row < rb;
    return col < this.col[b]!;
  }

  private siftUp(s: number): number {
    const heap = this.heap;
    const i = heap[s]!;
    while (s > 0) {
      const parent = (s - 1) >> 1;
      const p = heap[parent]!;
      if (!this.before(i, p)) break;
      heap[s] = p;
      this.slot[p] = s;
      s = parent;
    }
    heap[s] = i;
    this.slot[i] = s;
    return s;
  }

  private siftDown(s: number): void {
    const heap = this.heap;
    const n = this.size;
    const i = heap[s]!;
    for (;;) {
      const left = 2 * s + 1;
      if (left >= n) break;
      const right = left + 1;
      let child = left;
      if (right < n && this.before(heap[right]!, heap[left]!)) child = right;
      const c = heap[child]!;
      if (!this.before(c, i)) break;
      heap[s] = c;
      this.slot[c] = s;
      s = child;
    }
    heap[s] = i;
    this.slot[i] = s;
  }
}
