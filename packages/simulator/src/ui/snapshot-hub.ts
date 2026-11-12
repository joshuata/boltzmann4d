// Hands the physics worker's state snapshots to their consumers (joshuata/boltzmann4d#84):
// completes each with its run's masses and radii, which the worker sends only once per
// run, and calls every listener once per snapshot, in order.
import type { StateSnapshot } from '@boltzmann4d/engine/sim';
import type { SnapshotMessage } from '../worker';

export type SnapshotListener = (snapshot: StateSnapshot) => void;

export class SnapshotHub {
  readonly #listeners = new Set<SnapshotListener>();
  #constants: { run: number; masses: Float64Array; radii: Float64Array } | null = null;
  readonly #onError: (message: string) => void;

  /** `onError`: told when a listener throws (the others still run). */
  constructor(onError: (message: string) => void) {
    this.#onError = onError;
  }

  /** Calls `listener` with every snapshot from now on; returns its remover. */
  add(listener: SnapshotListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  get size(): number {
    return this.#listeners.size;
  }

  /** A snapshot from the worker, complete; null if its run's masses and radii never came. */
  receive(message: SnapshotMessage): StateSnapshot | null {
    if (message.masses && message.radii) {
      this.#constants = { run: message.run, masses: message.masses, radii: message.radii };
    }
    const constants = this.#constants;
    if (!constants || constants.run !== message.run) return null;
    const snapshot: StateSnapshot = {
      ...message,
      masses: constants.masses,
      radii: constants.radii,
    };
    for (const listener of [...this.#listeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        this.#onError(
          `Snapshot listener: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return snapshot;
  }
}
