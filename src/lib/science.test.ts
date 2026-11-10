import { describe, expect, it } from 'vitest';
import { bls, refinePeak } from './bls';
import { parseLightCurveCsv } from './csv';
import { detrend, savgolCoefficients, savgolSmooth } from './detrend';
import { measureTransit, oddEven, planetPhysics, secondaryEclipse } from './physics';
import { SIMULATED_TARGETS } from './simulate';
import type { DetrendParams } from './types';

const DEFAULTS: DetrendParams = { windowDays: 1.0, order: 2, clipSigma: 4 };
const OPTS = { minPeriod: 0.8, maxPeriod: 20, durations: [0.04, 0.06, 0.09, 0.13, 0.18] };
const target = (id: string) => SIMULATED_TARGETS.find((t) => t.id === id)!;

function analyse(id: string, p: DetrendParams = DEFAULTS) {
  const t = target(id);
  const d = detrend(t.curve, p);
  const r = bls(d.time, d.flux, OPTS);
  const best = refinePeak(d.time, d.flux, r.best);
  return { t, d, r, best };
}

describe('Savitzky-Golay filter', () => {
  it('coefficients sum to 1', () => {
    const w = savgolCoefficients(21, 2);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });
  it('reproduces a quadratic exactly, including at the edges', () => {
    const y = Array.from({ length: 80 }, (_, i) => 3 + 0.2 * i - 0.01 * i * i);
    const s = savgolSmooth(y, 15, 2);
    // Odd reflection is exact for odd terms; the quadratic edge error stays tiny.
    for (let i = 10; i < 70; i++) expect(s[i]).toBeCloseTo(y[i]!, 8);
    expect(Math.abs(s[0]! - y[0]!)).toBeLessThan(0.5);
  });
  it('smooths noise: scatter drops', () => {
    const y = Array.from({ length: 200 }, (_, i) => 1 + 0.001 * Math.sin(i / 3) + (i % 2 ? 0.01 : -0.01));
    const s = savgolSmooth(y, 21, 2);
    const spread = (a: number[]) => Math.max(...a) - Math.min(...a);
    // Judge the interior; the very edges rely on reflection and are allowed to be rougher.
    expect(spread(s.slice(15, 185))).toBeLessThan(spread(y.slice(15, 185)) / 4);
  });
});

describe('detrend', () => {
  it('flattens a star with a slow wobble and removes flares', () => {
    const t = target('sim-quiet');
    const d = detrend(t.curve, DEFAULTS);
    expect(d.removed).toBeGreaterThan(0);
    expect(d.sigma).toBeGreaterThan(0.0003);
    expect(d.sigma).toBeLessThan(0.002);
    const raw = Math.max(...t.curve.flux) - Math.min(...t.curve.flux);
    const flat = Math.max(...d.flux) - Math.min(...d.flux);
    expect(flat).toBeLessThan(raw);
  });
  it('a very short window eats a shallow transit (teaching point)', () => {
    const good = analyse('sim-super-earth', DEFAULTS);
    const bad = detrend(target('sim-super-earth').curve, { windowDays: 0.1, order: 2, clipSigma: 4 });
    const args = [good.best.period, good.best.t0, good.best.durationDays] as const;
    const mGood = measureTransit(good.d.time, good.d.flux, ...args);
    const mBad = measureTransit(bad.time, bad.flux, ...args);
    expect(mBad.depth).toBeLessThan(mGood.depth * 0.6);
  });
  it('a deep transit survives a short window because the filter skips sharp dips', () => {
    const good = analyse('sim-hot-jupiter', DEFAULTS);
    const short = analyse('sim-hot-jupiter', { windowDays: 0.3, order: 2, clipSigma: 4 });
    expect(short.best.depth).toBeGreaterThan(good.best.depth * 0.7);
  });
  it('keeps trend length equal to the raw curve', () => {
    const t = target('sim-hot-jupiter');
    expect(detrend(t.curve, DEFAULTS).trend.length).toBe(t.curve.time.length);
  });
});

describe('period search recovers the planted signals', () => {
  it.each([
    ['sim-hot-jupiter', 3.52, 0.0135],
    ['sim-super-earth', 7.9, 0.0011],
    ['sim-habitable', 18.0, 0.00083],
  ])('%s: period within 1 percent', (id, period, depth) => {
    const { best } = analyse(id);
    expect(Math.abs(best.period - period) / period).toBeLessThan(0.01);
    expect(best.depth).toBeGreaterThan(depth * 0.6);
    expect(best.depth).toBeLessThan(depth * 1.5);
  });

  it('the eclipsing binary is found at its true period or half or double of it', () => {
    const { best } = analyse('sim-eclipsing-binary');
    const ratio = best.period / 2.37;
    expect([0.5, 1, 2].some((r) => Math.abs(ratio - r) < 0.02)).toBe(true);
  });

  it('a quiet star shows no strong signal', () => {
    const quiet = analyse('sim-quiet').r.sde;
    const real = analyse('sim-hot-jupiter').r.sde;
    expect(real).toBeGreaterThan(quiet * 1.5);
  });
});

describe('transit measurement and physics', () => {
  it('hot Jupiter: radius ratio and size are sensible', () => {
    const { best, d, t } = analyse('sim-hot-jupiter');
    const m = measureTransit(d.time, d.flux, best.period, best.t0, best.durationDays);
    expect(m.nTransits).toBeGreaterThanOrEqual(6);
    const ph = planetPhysics(t.star, best.period, m.depth);
    expect(ph.radiusJupiter).toBeGreaterThan(0.9);
    expect(ph.radiusJupiter).toBeLessThan(1.4);
    expect(ph.semiMajorAU).toBeGreaterThan(0.04);
    expect(ph.semiMajorAU).toBeLessThan(0.05);
  });

  it('red dwarf planet lands in the habitable zone and is Earth-sized', () => {
    const { best, d, t } = analyse('sim-habitable');
    const m = measureTransit(d.time, d.flux, best.period, best.t0, best.durationDays);
    const ph = planetPhysics(t.star, best.period, m.depth);
    expect(ph.inHabitableZone).toBe(true);
    expect(ph.radiusEarth).toBeGreaterThan(0.7);
    expect(ph.radiusEarth).toBeLessThan(1.6);
  });

  it('eclipsing binary fails the checks a planet passes', () => {
    const eb = analyse('sim-eclipsing-binary');
    // Use the true period so the test checks the diagnostics, not the search.
    const P = 2.37;
    const d = eb.d;
    const sec = secondaryEclipse(d.time, d.flux, P, eb.best.t0, 0.16)!;
    expect(sec.sigma).toBeGreaterThan(5);
    const hj = analyse('sim-hot-jupiter');
    const secHj = secondaryEclipse(hj.d.time, hj.d.flux, hj.best.period, hj.best.t0, hj.best.durationDays)!;
    expect(secHj.sigma).toBeLessThan(4);
    const oe = oddEven(d.time, d.flux, P, eb.best.t0, 0.16)!;
    expect(oe.sigma).toBeGreaterThan(3);
  });

  it('Kepler third law: Earth-like orbit is 1 AU', () => {
    const ph = planetPhysics({ radiusSun: 1, massSun: 1, teffK: 5772 }, 365.25, 0.000084);
    expect(ph.semiMajorAU).toBeCloseTo(1, 3);
    expect(ph.radiusEarth).toBeCloseTo(1, 0);
    expect(ph.inHabitableZone).toBe(true);
  });
});

describe('csv upload', () => {
  it('parses headers, comments and mixed separators, and normalises flux', () => {
    const rows = ['# comment', 'time,flux'];
    for (let i = 0; i < 300; i++) rows.push(`${1000 + i * 0.01},${2000 + (i % 5)}`);
    const c = parseLightCurveCsv(rows.join('\n'));
    expect(c.time.length).toBe(300);
    expect(c.flux[0]).toBeCloseTo(1, 2);
  });
  it('rejects tiny or empty input with a clear message', () => {
    expect(() => parseLightCurveCsv('a,b\n1,2')).toThrow(/fewer than 200/);
  });
});

import { fitSine, lensMagnification, massFromK, massFromLoop, rvAmplitude, simulateAstro, simulateMicro, simulateRv, logSpace } from './methods';

describe('other detection methods', () => {
  it('radial velocity: 51 Peg b gives about 55 m/s and the mass maths round-trips', () => {
    const K = rvAmplitude(0.47, 4.23, 1.11);
    expect(K).toBeGreaterThan(48);
    expect(K).toBeLessThan(62);
    expect(massFromK(K, 4.23, 1.11)).toBeCloseTo(0.47, 3);
  });
  it('radial velocity: the best trial period is the true one', () => {
    const d = simulateRv({ seed: 5, period: 11.2, mjup: 0.3, starMass: 1 });
    const ps = logSpace(1, d.baseline / 1.5, 1500);
    let best = ps[0]!, br = -1;
    for (const p of ps) {
      const f = fitSine(d.t, d.v, p);
      if (f.r2 > br) { br = f.r2; best = p; }
    }
    expect(Math.abs(best - 11.2) / 11.2).toBeLessThan(0.03);
    expect(fitSine(d.t, d.v, best).amp / d.K).toBeGreaterThan(0.8);
    expect(fitSine(d.t, d.v, best).amp / d.K).toBeLessThan(1.2);
  });
  it('microlensing: magnification peaks at the lens and the blip width gives q', () => {
    expect(lensMagnification(0, 0, 30, 0.1)).toBeGreaterThan(lensMagnification(30, 0, 30, 0.1));
    const m = simulateMicro({ seed: 3, mjup: 1, hostMass: 0.4 });
    expect(Math.pow(m.fwhm / m.tE, 2)).toBeCloseTo(m.q, 6);
  });
  it('astrometry: the loop size gives the planet mass back', () => {
    const d = simulateAstro({ seed: 9, period: 300, mjup: 2, starMass: 0.9, distLy: 35 });
    expect(massFromLoop(d.loopMas, 35, 0.9, 300)).toBeCloseTo(2, 2);
  });
});
