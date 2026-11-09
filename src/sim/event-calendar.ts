// Event calendar (port of Calendar.java).
//
// Holds the next predicted event for every particle pair and for every particle against
// the boundaries, and finds the soonest one. Despite the Java comments it is not a heap:
// events sit in a triangular matrix, each row caches the column of its own minimum, and
// rows are flagged for a full rescan when many of their entries change at once.
//
//   row 0:  boundary events, one column per particle (part1 = column)
//   row r:  events between particle r and particles 0..r-1 (part1 = column, part2 = r)
//
// Ties are resolved exactly as in Java and parity depends on it: within a row the
// lowest column wins a full rescan, an incremental update only takes over the cached
// minimum when strictly earlier, and across rows the lowest row wins.
//
// Storage is flat typed arrays (rows laid end to end) rather than objects per event.
// Calendar.Grow/Shrink are not ported: nothing in the Java app calls them.
import { createCounters } from './counters';
import { CalendarUpdate, Collision, MAX_TIME as MAX, type EventInfo } from './event';

// Local copies of imported constants: hot paths read these instead of module bindings
// (which test runners and some bundlers turn into getter calls).
const MAX_TIME = MAX;
const { PARTICLE, WALL, ENTER_WELL, EXIT_WELL } = Collision;
const { PARTICLE_1, PARTICLE_2, PARTICLE_ALL, BOUNDARY_ALL, PISTON_ALL, EVERYTHING, RESORT } =
  CalendarUpdate;

export class EventCalendar {
  readonly particleCount: number;

  /** Work done so far: updates, row rescans, entries scanned, minimum searches. */
  readonly counters = createCounters('updates', 'rowRescans', 'entriesScanned', 'findMinimum');

  // One slot per event, rows laid end to end.
  private readonly time: Float64Array;
  private readonly type: Uint8Array;
  private readonly side: Uint8Array;

  // Per row.
  private readonly rowStart: Int32Array;
  private readonly rowLength: Int32Array;
  private readonly minPos: Int32Array;
  private readonly needsRescan: Uint8Array;

  /** Row holding the soonest event, or -1 when findMinimum() must run first. */
  private minRow = -1;

  constructor(particleCount: number) {
    const n = particleCount;
    this.particleCount = n;
    const rows = Math.max(n, 1); // the boundary row exists even with no particles
    this.rowStart = new Int32Array(rows);
    this.rowLength = new Int32Array(rows);
    this.rowLength[0] = n;
    for (let row = 1; row < rows; row++) {
      this.rowStart[row] = n + (row * (row - 1)) / 2;
      this.rowLength[row] = row;
    }
    const slots = n + (n * (n - 1)) / 2;
    this.time = new Float64Array(slots).fill(MAX_TIME);
    this.type = new Uint8Array(slots).fill(PARTICLE);
    this.type.fill(WALL, 0, n);
    this.side = new Uint8Array(slots);
    this.minPos = new Int32Array(rows);
    this.needsRescan = new Uint8Array(rows).fill(1);
  }

  /** Time of the soonest event; MAX_TIME until findMinimum() has run since the last change. */
  nextEventTime(): number {
    if (this.minRow === -1) return MAX_TIME;
    return (
      this.time[(this.rowStart[this.minRow] ?? 0) + (this.minPos[this.minRow] ?? 0)] ?? MAX_TIME
    );
  }

  /**
   * Copies the soonest event into `into` and clears it from the calendar (its time becomes
   * MAX_TIME). Requires findMinimum() again before the next call; until then this returns
   * a placeholder event of type -1 at MAX_TIME.
   */
  nextEvent(into: EventInfo): EventInfo {
    const row = this.minRow;
    if (row === -1) {
      into.type = -1;
      into.time = MAX_TIME;
      into.part1 = into.part2 = into.side = -1;
      return into;
    }
    const col = this.minPos[row] ?? 0;
    const slot = (this.rowStart[row] ?? 0) + col;
    into.type = (this.type[slot] ?? 0) as EventInfo['type'];
    into.time = this.time[slot] ?? MAX_TIME;
    into.side = this.side[slot] ?? 0;
    into.part1 = col;
    into.part2 = row; // boundary row: 0, as in Java
    this.time[slot] = MAX_TIME;
    this.minRow = -1;
    return into;
  }

  /**
   * Flags the rows an action is about to change for a full rescan (MarkEventToUpdate).
   * Row r holds particle r's events with lower-numbered particles; its events with
   * higher-numbered particles live in other rows and are kept current incrementally.
   */
  markForUpdate(action: EventInfo): void {
    this.minRow = -1;
    const rows = this.needsRescan;
    switch (action.type) {
      case PARTICLE_2:
        rows[action.part1] = 1;
        rows[action.part2] = 1;
        break;
      case PARTICLE_1:
        rows[action.part1] = 1;
        break;
      case PARTICLE_ALL:
        rows.fill(1, 1, this.particleCount);
        break;
      case BOUNDARY_ALL:
      case PISTON_ALL:
        rows[0] = 1;
        break;
      case EVERYTHING:
      case RESORT:
        rows[0] = 1;
        rows.fill(1, 1, this.particleCount);
        break;
    }
  }

  /**
   * Records a predicted event (Calendar.Update). Pair events (PARTICLE, ENTER_WELL,
   * EXIT_WELL) go in the pair's slot whatever the argument order; every other type is
   * stored as part1's boundary event, as in Java.
   */
  update(type: number, part1: number, part2: number, side: number, time: number): void {
    if (type === PARTICLE && part1 === part2) return;
    this.counters.updates++;

    let row: number;
    let col: number;
    if (type === PARTICLE || type === ENTER_WELL || type === EXIT_WELL) {
      row = part1 > part2 ? part1 : part2;
      col = part1 < part2 ? part1 : part2;
    } else {
      row = 0;
      col = part1;
    }
    const start = this.rowStart[row] ?? 0;
    this.time[start + col] = time;
    this.side[start + col] = side;
    this.type[start + col] = type;

    // A row flagged for rescan is rebuilt in findMinimum(); otherwise keep its minimum current.
    if (this.needsRescan[row]) return;
    const minCol = this.minPos[row] ?? 0;
    if (minCol !== col) {
      if (time < (this.time[start + minCol] ?? MAX_TIME)) this.minPos[row] = col;
    } else {
      this.rescanRow(row);
    }
  }

  /** Rescans flagged rows and finds the row with the soonest event (FindMinimum). */
  findMinimum(): void {
    this.counters.findMinimum++;
    if (this.particleCount === 0) {
      this.minRow = -1;
      return;
    }
    let minRow = 0;
    if (this.needsRescan[0]) this.rescanRow(0);
    this.needsRescan[0] = 0;
    let minTime = this.time[this.minPos[0] ?? 0] ?? MAX_TIME;

    for (let row = 1; row < this.particleCount; row++) {
      if (this.needsRescan[row]) this.rescanRow(row);
      this.needsRescan[row] = 0;
      const rowMin = this.time[(this.rowStart[row] ?? 0) + (this.minPos[row] ?? 0)] ?? MAX_TIME;
      if (rowMin < minTime) {
        minRow = row;
        minTime = rowMin;
      }
    }
    this.minRow = minRow;
  }

  /** Time stored for a pair event (either argument order), for tests and debugging. */
  pairEventTime(part1: number, part2: number): number {
    const row = Math.max(part1, part2);
    return this.time[(this.rowStart[row] ?? 0) + Math.min(part1, part2)] ?? MAX_TIME;
  }

  /** Time stored for a particle's boundary event, for tests and debugging. */
  boundaryEventTime(part: number): number {
    return this.time[part] ?? MAX_TIME;
  }

  private rescanRow(row: number): void {
    const start = this.rowStart[row] ?? 0;
    const length = this.rowLength[row] ?? 0;
    const time = this.time;
    let minCol = 0;
    let minTime = time[start] ?? MAX_TIME;
    for (let col = 1; col < length; col++) {
      const t = time[start + col] ?? MAX_TIME;
      if (t < minTime) {
        minCol = col;
        minTime = t;
      }
    }
    this.minPos[row] = minCol;
    this.counters.rowRescans++;
    this.counters.entriesScanned += length;
  }
}
