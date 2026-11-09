// Calendar micro-benchmarks: run with `mise run bench`.
// One "event cycle" is what the engine does per particle–particle collision: take the
// soonest event, flag the two particles' rows, re-predict both particles against every
// other particle and the boundaries, then find the new minimum. Predictions are random
// numbers here, so this measures the calendar alone.
import { test } from 'vitest';
import { CalendarUpdate, Collision, createEvent } from './event';
import { EventCalendar } from './event-calendar';

function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Local copies, so the timed loop doesn't read module bindings (see event-calendar.ts).
const { PARTICLE, WALL } = Collision;
const PARTICLE_2 = CalendarUpdate.PARTICLE_2;

for (const n of [60, 200, 1000]) {
  test(`calendar event cycle: ${n} particles`, async ({ bench }) => {
    const random = seededRandom(n);
    const event = createEvent();
    const action = createEvent(PARTICLE_2);
    let calendar = new EventCalendar(n);
    let now = 0;

    const repredict = (p: number) => {
      for (let q = 0; q < n; q++) {
        if (q !== p) calendar.update(PARTICLE, p, q, 0, now + random());
      }
      calendar.update(WALL, p, 0, 0, now + random());
    };

    await bench(
      `${n} particles`,
      {
        beforeAll: () => {
          calendar = new EventCalendar(n);
          now = 0;
          for (let p = 0; p < n; p++) repredict(p);
          calendar.findMinimum();
        },
      },
      () => {
        calendar.nextEvent(event);
        now = event.time;
        action.part1 = event.part1;
        action.part2 = event.type === PARTICLE ? event.part2 : event.part1;
        calendar.markForUpdate(action);
        repredict(action.part1);
        if (action.part2 !== action.part1) repredict(action.part2);
        calendar.findMinimum();
      },
    ).run();
  });
}
