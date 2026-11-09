// Main-thread <-> simulation-worker message protocol (mirrors ThreadController.java).
import type { RenderFrame } from '../sim';

export type ToWorker = { type: 'play' } | { type: 'pause' } | { type: 'step' };

export type FromWorker = { type: 'frame'; frame: RenderFrame };
