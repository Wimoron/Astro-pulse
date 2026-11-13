import { describe, expect, it } from 'vitest';
import { autoPeriod, cleaned, dayIndex, foldAt, makePuzzle, score, streak, tierForDay, type Tier } from './hunt';
import { readCandidate, verdictOf } from './candidates';

describe('hunt', () => {
  it('makes the same puzzle for the same seed', () => {
    const a = makePuzzle(20400, 1);
    const b = makePuzzle(20400, 1);
    expect(a.truth).toEqual(b.truth);
    expect(a.curve.flux.slice(0, 20)).toEqual(b.curve.flux.slice(0, 20));
  });
  it('mixes planets, binaries and empty stars', () => {
    const kinds = new Set<string>();
    for (let s = 0; s < 60; s++) kinds.add(makePuzzle(s, 0).truth.kind);
    expect(kinds).toEqual(new Set(['planet', 'binary', 'none']));
  });
  it('finds the true period with the folding tool on easy planets', () => {
    let tested = 0;
    for (let s = 0; s < 40 && tested < 5; s++) {
      const p = makePuzzle(s, 0);
      if (p.truth.kind !== 'planet') continue;
      tested++;
      const lc = cleaned(p.curve);
      const right = foldAt(lc, p.truth.periodDays!).strength;
      const wrong = foldAt(lc, p.truth.periodDays! * 1.37).strength;
      expect(right).toBeGreaterThan(wrong * 1.5);
      expect(Math.abs(autoPeriod(lc) - p.truth.periodDays!) / p.truth.periodDays!).toBeLessThan(0.03);
    }
    expect(tested).toBe(5);
  });
  it('scores right and wrong answers', () => {
    const p = makePuzzle(3, 0);
    const t = p.truth;
    const full = score(p, t.kind, t.kind === 'none' ? null : t.periodDays, false);
    expect(full.total).toBe(100);
    expect(score(p, t.kind, t.kind === 'none' ? null : t.periodDays, true).total).toBe(75);
    const wrong = score(p, t.kind === 'planet' ? 'none' : 'planet', 5, false);
    expect(wrong.verdictPts).toBe(0);
  });
  it('gives partial credit for half or double the period', () => {
    let p = makePuzzle(0, 0);
    for (let s = 1; p.truth.kind !== 'planet'; s++) p = makePuzzle(s, 0);
    expect(score(p, 'planet', p.truth.periodDays! * 2, false).periodPts).toBe(15);
  });
  it('counts a streak and picks a tier for every day', () => {
    const log = { days: { '10': { pts: 80, verdict: 'planet' as const }, '9': { pts: 50, verdict: 'none' as const }, '7': { pts: 9, verdict: 'none' as const } }, practice: 0 };
    expect(streak(log, 10)).toBe(2);
    expect(streak(log, 11)).toBe(2);
    expect(streak(log, 12)).toBe(0);
    for (let d = 0; d < 14; d++) expect([0, 1, 2, 3]).toContain(tierForDay(d) as Tier);
    expect(Number.isInteger(dayIndex(new Date('2026-11-12T10:00:00')))).toBe(true);
  });
});

describe('candidates', () => {
  it('reads a planet-like curve and flags nothing odd', () => {
    let p = makePuzzle(0, 0);
    for (let s = 1; p.truth.kind !== 'planet'; s++) p = makePuzzle(s, 0);
    const r = readCandidate(p.curve, { periodDays: p.truth.periodDays! * 1.005, durationHours: 3 })!;
    expect(Math.abs(r.period - p.truth.periodDays!) / p.truth.periodDays!).toBeLessThan(0.02);
    expect(r.snr).toBeGreaterThan(7);
  });
  it('judges calls against NASA answers', () => {
    expect(verdictOf({ toi: '1.01', call: 'planet', at: 0 })).toBeNull();
    expect(verdictOf({ toi: '1.01', call: 'planet', at: 0, nasa: 'PC' })).toBeNull();
    expect(verdictOf({ toi: '1.01', call: 'planet', at: 0, nasa: 'CP' })).toBe('right');
    expect(verdictOf({ toi: '1.01', call: 'planet', at: 0, nasa: 'FP' })).toBe('wrong');
    expect(verdictOf({ toi: '1.01', call: 'false', at: 0, nasa: 'FP' })).toBe('right');
  });
});

import { badges, planetFacts, standing, xpOf } from './progress';
describe('progress', () => {
  it('ranks up with experience', () => {
    expect(standing(0).rank).toBe('Cadet');
    expect(standing(60).rank).toBe('Observer');
    expect(standing(5000).next).toBeNull();
    expect(standing(130).pct).toBeCloseTo(0.5, 1);
  });
  it('adds experience and badges', () => {
    const hunt = { days: { '5': { pts: 80, verdict: 'planet' as const } }, practice: 2 };
    const col = [{ id: 'a', name: 'A b', method: 'rv' as const, at: 0, facts: [] }];
    expect(xpOf(col, hunt, [{ toi: '1.01', call: 'planet', at: 0 }])).toBe(25 + 80 + 10 + 10);
    const b = badges(col, hunt, []);
    expect(b.find((x) => x.id === 'rv')!.got).toBe(true);
    expect(b.find((x) => x.id === 'transit')!.got).toBe(false);
    expect(b.find((x) => x.id === 'first-hunt')!.got).toBe(true);
  });
  it('lists planet facts that exist', () => {
    const f = planetFacts({ label: 'x', periodDays: 4.23, radiusEarth: null, massJup: 0.47, sepAU: 0.05, distLy: 50, starMass: 1, year: 1995 });
    expect(f.map((x) => x[0])).toEqual(['Year', 'Mass', 'Orbit', 'Distance']);
  });
});

import { inGentlePeriod } from './hunt';
describe('gentle start', () => {
  it('is gentle for new players and ends after 7 days', () => {
    expect(inGentlePeriod({ days: {}, practice: 0 }, 100)).toBe(true);
    expect(inGentlePeriod({ days: { '100': { pts: 50, verdict: 'planet' } }, practice: 0 }, 106)).toBe(true);
    expect(inGentlePeriod({ days: { '100': { pts: 50, verdict: 'planet' } }, practice: 0 }, 107)).toBe(false);
  });
});
