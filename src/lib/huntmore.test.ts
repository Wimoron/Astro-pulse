import { describe, expect, it } from 'vitest';
import { autoPeriodRv, foldRv, makeAstro, makeImaging, makeMicro, makeRv, methodForDay, methodForSeed, scoreCall, scoreImaging } from './huntmore';

describe('method picker', () => {
  it('covers all five methods in every block of five days', () => {
    for (const b of [0, 7, 3000]) expect(new Set(Array.from({ length: 5 }, (_, i) => methodForDay(b * 5 + i))).size).toBe(5);
  });
  it('practice seeds reach every method', () => {
    expect(new Set(Array.from({ length: 200 }, (_, i) => methodForSeed(i * 7 + 1))).size).toBe(5);
  });
});

describe('generators', () => {
  it('are deterministic', () => {
    expect(makeRv(5, 1).v).toEqual(makeRv(5, 1).v);
    expect(makeImaging(9, 2).frames[0]).toEqual(makeImaging(9, 2).frames[0]);
  });
  it('wobble: auto period finds a planet period', () => {
    let hit = 0, n = 0;
    for (let s = 1; s < 60; s++) {
      const p = makeRv(s, 0);
      if (p.truth.kind !== 'planet') continue;
      n++;
      const a = autoPeriodRv(p.t, p.v);
      if (Math.abs(a - p.truth.periodDays!) / p.truth.periodDays! < 0.1) hit++;
    }
    expect(hit / n).toBeGreaterThan(0.7);
  });
  it('wobble fold is stronger at the true period', () => {
    const p = makeRv(11, 0);
    if (p.truth.periodDays) expect(foldRv(p.t, p.v, p.truth.periodDays).strength).toBeGreaterThan(foldRv(p.t, p.v, p.truth.periodDays * 1.37).strength);
  });
  it('flash and position have both outcomes', () => {
    expect(new Set(Array.from({ length: 30 }, (_, i) => makeMicro(i, 0).truth.kind)).size).toBe(2);
    expect(new Set(Array.from({ length: 30 }, (_, i) => makeAstro(i, 0).truth.kind)).size).toBe(2);
  });
});

describe('scoring', () => {
  it('scoreCall', () => {
    expect(scoreCall('planet', 'planet').total).toBe(100);
    expect(scoreCall('planet', 'none').total).toBe(0);
  });
  it('imaging', () => {
    const p = makeImaging(2, 0);
    if (p.planet) {
      expect(scoreImaging(p, { frame: 1, x: p.planet[1][0] + 2, y: p.planet[1][1] }).total).toBe(100);
      expect(scoreImaging(p, null).total).toBe(0);
    }
  });
});
