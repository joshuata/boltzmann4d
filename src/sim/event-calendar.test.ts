import { describe, expect, it } from 'vitest';
import { CalendarUpdate, Collision, createEvent, MAX_TIME, Wall, type EventInfo } from './event';
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

const pop = (calendar: EventCalendar) => {
  calendar.findMinimum();
  return calendar.nextEvent(createEvent());
};

describe('EventCalendar', () => {
  it('reports nothing for an empty calendar', () => {
    const calendar = new EventCalendar(0);
    calendar.findMinimum();
    expect(calendar.nextEventTime()).toBe(MAX_TIME);
    expect(calendar.nextEvent(createEvent())).toEqual({
      type: -1,
      time: MAX_TIME,
      part1: -1,
      part2: -1,
      side: -1,
    });
  });

  it('needs findMinimum() before it reports an event', () => {
    const calendar = new EventCalendar(3);
    calendar.update(Collision.WALL, 2, 0, Wall.TOP, 1.5);
    expect(calendar.nextEventTime()).toBe(MAX_TIME);
    calendar.findMinimum();
    expect(calendar.nextEventTime()).toBe(1.5);
  });

  it('returns boundary events with part2 = 0 and the stored side', () => {
    const calendar = new EventCalendar(3);
    calendar.update(Collision.WALL, 2, 0, Wall.TOP, 1.5);
    expect(pop(calendar)).toEqual({
      type: Collision.WALL,
      time: 1.5,
      part1: 2,
      part2: 0,
      side: Wall.TOP,
    });
  });

  it('stores pair events once, lower index first, whatever the argument order', () => {
    const calendar = new EventCalendar(4);
    calendar.update(Collision.PARTICLE, 3, 1, 0, 2.0);
    expect(calendar.pairEventTime(1, 3)).toBe(2.0);
    calendar.update(Collision.PARTICLE, 1, 3, Wall.LEFT, 1.0);
    expect(pop(calendar)).toEqual({
      type: Collision.PARTICLE,
      time: 1.0,
      part1: 1,
      part2: 3,
      side: Wall.LEFT,
    });
  });

  it('ignores a particle colliding with itself', () => {
    const calendar = new EventCalendar(2);
    calendar.update(Collision.PARTICLE, 1, 1, 0, 1.0);
    calendar.findMinimum();
    expect(calendar.nextEventTime()).toBe(MAX_TIME);
    expect(calendar.counters.updates).toBe(0);
  });

  it('clears an event once it has been taken', () => {
    const calendar = new EventCalendar(2);
    calendar.update(Collision.PARTICLE, 0, 1, 0, 1.0);
    pop(calendar);
    expect(calendar.pairEventTime(0, 1)).toBe(MAX_TIME);
    expect(calendar.nextEvent(createEvent()).type).toBe(-1); // findMinimum() not rerun
  });

  describe('ties, as in Calendar.java', () => {
    it('a rescan picks the lowest column', () => {
      const calendar = new EventCalendar(4);
      calendar.update(Collision.PARTICLE, 3, 2, 0, 5);
      calendar.update(Collision.PARTICLE, 3, 0, 0, 5);
      calendar.update(Collision.PARTICLE, 3, 1, 0, 5);
      expect(pop(calendar)).toMatchObject({ part1: 0, part2: 3 });
    });

    it('across rows, the lowest row wins (the boundary row first)', () => {
      const calendar = new EventCalendar(4);
      calendar.update(Collision.PARTICLE, 3, 0, 0, 5);
      calendar.update(Collision.PARTICLE, 2, 1, 0, 5);
      calendar.update(Collision.WALL, 3, 0, Wall.LEFT, 5);
      expect(pop(calendar)).toMatchObject({ type: Collision.WALL, part1: 3 });
      calendar.markForUpdate(createEvent(CalendarUpdate.PARTICLE_1, 0, 3));
      calendar.update(Collision.WALL, 3, 0, Wall.LEFT, MAX_TIME);
      expect(pop(calendar)).toMatchObject({ part1: 1, part2: 2 });
    });

    it('an incremental update only takes over the cached minimum when strictly earlier', () => {
      const calendar = new EventCalendar(4);
      calendar.update(Collision.PARTICLE, 3, 2, 0, 5);
      calendar.findMinimum(); // row 3 now caches column 2 and is no longer flagged
      calendar.update(Collision.PARTICLE, 3, 0, 0, 5); // equal time, lower column: stays on 2
      expect(pop(calendar)).toMatchObject({ part1: 2, part2: 3 });
    });
  });

  it('flags the rows an action names (row 0 doubles as particle 0, as in Java)', () => {
    const calendar = new EventCalendar(3);
    calendar.findMinimum();
    const before = calendar.counters.rowRescans;
    calendar.markForUpdate(createEvent(CalendarUpdate.PARTICLE_2, 0, 0, 2));
    calendar.findMinimum();
    expect(calendar.counters.rowRescans - before).toBe(2); // rows 0 and 2

    calendar.markForUpdate(createEvent(CalendarUpdate.EVERYTHING));
    const beforeAll = calendar.counters.rowRescans;
    calendar.findMinimum();
    expect(calendar.counters.rowRescans - beforeAll).toBe(3);
  });

  it('always yields the soonest event under the update protocol the physics follows', () => {
    // A reference model: every slot's time in a Map, searched by brute force. Times are
    // random doubles, so ties (whose resolution depends on history) don't occur.
    const n = 12;
    const random = seededRandom(42);
    const calendar = new EventCalendar(n);
    const model = new Map<string, number>();
    const key = (type: number, a: number, b: number) =>
      type === Collision.PARTICLE ? `p${Math.min(a, b)},${Math.max(a, b)}` : `b${a}`;

    const predict = (type: number, a: number, b: number) => {
      const time = random() < 0.1 ? MAX_TIME : random() * 100;
      calendar.update(type, a, b, 0, time);
      model.set(key(type, a, b), time);
    };
    const repredictParticle = (p: number) => {
      for (let q = 0; q < n; q++) if (q !== p) predict(Collision.PARTICLE, p, q);
      predict(Collision.WALL, p, 0);
    };

    calendar.markForUpdate(createEvent(CalendarUpdate.EVERYTHING));
    for (let p = 0; p < n; p++) repredictParticle(p);

    const event: EventInfo = createEvent();
    for (let step = 0; step < 2000; step++) {
      calendar.findMinimum();
      const expected = Math.min(...model.values());
      expect(calendar.nextEventTime()).toBe(expected);
      calendar.nextEvent(event);
      expect(event.time).toBe(expected);
      model.set(key(event.type, event.part1, event.part2), MAX_TIME);

      // What Physics.CalUpdate does after performing the event.
      if (event.type === Collision.PARTICLE) {
        calendar.markForUpdate(createEvent(CalendarUpdate.PARTICLE_2, 0, event.part1, event.part2));
        repredictParticle(event.part1);
        repredictParticle(event.part2);
      } else {
        calendar.markForUpdate(createEvent(CalendarUpdate.PARTICLE_1, 0, event.part1));
        repredictParticle(event.part1);
      }
    }
  });
});
