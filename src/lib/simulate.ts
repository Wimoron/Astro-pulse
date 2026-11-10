import type { LightCurve, StarInfo, Target } from './types';

/** Small deterministic random generator so every student sees the same sky. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number): number {
  const u = Math.max(1e-12, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/** Trapezoid dip: full depth at the middle, linear ingress and egress. */
export function trapezoid(dt: number, depth: number, duration: number, ingress: number): number {
  const a = Math.abs(dt);
  const half = duration / 2;
  if (a >= half) return 0;
  if (a <= half - ingress) return depth;
  return depth * ((half - a) / ingress);
}

export interface SimSpec {
  seed: number;
  days: number;
  cadenceMin: number;
  noise: number; // per-point fractional scatter
  rotationDays: number;
  variability: number; // fractional amplitude
  flares: number;
  gap: [number, number] | null;
  transits: Array<{ period: number; t0: number; depth: number; duration: number; secondary?: number; oddEvenRatio?: number }>;
}

export function simulateCurve(s: SimSpec): LightCurve {
  const r = rng(s.seed);
  const step = s.cadenceMin / 1440;
  const time: number[] = [];
  const flux: number[] = [];
  const flares: Array<{ t: number; amp: number; tau: number }> = [];
  for (let i = 0; i < s.flares; i++) flares.push({ t: r() * s.days, amp: (0.004 + r() * 0.01) * (1 + r()), tau: 0.01 + r() * 0.02 });
  const ph1 = r() * 6.28;
  const ph2 = r() * 6.28;
  for (let t = 0; t <= s.days; t += step) {
    if (s.gap && t >= s.gap[0] && t <= s.gap[1]) continue;
    let f = 1;
    f += s.variability * Math.sin((2 * Math.PI * t) / s.rotationDays + ph1);
    f += 0.45 * s.variability * Math.sin((4 * Math.PI * t) / s.rotationDays + ph2);
    for (const fl of flares) if (t >= fl.t) f += fl.amp * Math.exp(-(t - fl.t) / fl.tau);
    for (const tr of s.transits) {
      let dt = (t - tr.t0) / tr.period;
      const n = Math.round(dt);
      dt = (dt - n) * tr.period;
      const ratio = tr.oddEvenRatio !== undefined && Math.abs(n) % 2 === 1 ? tr.oddEvenRatio : 1;
      f -= trapezoid(dt, tr.depth * ratio, tr.duration, tr.duration * 0.15);
      if (tr.secondary) {
        let d2 = (t - tr.t0 - tr.period / 2) / tr.period;
        d2 = (d2 - Math.round(d2)) * tr.period;
        f -= trapezoid(d2, tr.secondary, tr.duration, tr.duration * 0.15);
      }
    }
    f += s.noise * gauss(r);
    time.push(1325 + t);
    flux.push(f);
  }
  return { time, flux };
}

const SUN: StarInfo = { radiusSun: 1.0, massSun: 1.0, teffK: 5750 };
const MDWARF: StarInfo = { radiusSun: 0.35, massSun: 0.35, teffK: 3400 };

export const SIMULATED_TARGETS: Target[] = [
  {
    id: 'sim-hot-jupiter',
    name: 'SIM-001 · The obvious one',
    kind: 'simulated',
    source: 'Simulated (looks like TESS data)',
    blurb: 'A Sun-like star with a slow brightness wobble and a few flares. Good first target.',
    difficulty: 'easy',
    star: SUN,
    curve: simulateCurve({
      seed: 11, days: 27.4, cadenceMin: 10, noise: 0.0006, rotationDays: 6.3, variability: 0.004, flares: 4, gap: [13.6, 14.6],
      transits: [{ period: 3.52, t0: 1.9, depth: 0.0135, duration: 0.115 }],
    }),
    truth: { kind: 'planet', periodDays: 3.52, depthPpm: 13500, note: 'A hot Jupiter: a gas giant orbiting in 3.5 days.' },
  },
  {
    id: 'sim-super-earth',
    name: 'SIM-002 · The shy one',
    kind: 'simulated',
    source: 'Simulated (looks like TESS data)',
    blurb: 'The dip is tiny compared with the noise. Cleaning the data carefully makes the difference.',
    difficulty: 'medium',
    star: SUN,
    curve: simulateCurve({
      seed: 23, days: 27.4, cadenceMin: 10, noise: 0.0008, rotationDays: 8.1, variability: 0.006, flares: 3, gap: [13.6, 14.6],
      transits: [{ period: 7.9, t0: 4.2, depth: 0.0011, duration: 0.14 }],
    }),
    truth: { kind: 'planet', periodDays: 7.9, depthPpm: 1100, note: 'A super-Earth, about 3.5 times Earth’s width, orbiting every 7.9 days.' },
  },
  {
    id: 'sim-habitable',
    name: 'SIM-003 · Small red star',
    kind: 'simulated',
    source: 'Simulated (looks like TESS data)',
    blurb: 'A cool red dwarf. Only two transits fit in the data, so every one counts.',
    difficulty: 'hard',
    star: MDWARF,
    curve: simulateCurve({
      seed: 37, days: 27.4, cadenceMin: 10, noise: 0.00045, rotationDays: 4.6, variability: 0.005, flares: 7, gap: [13.6, 14.6],
      transits: [{ period: 18.0, t0: 3.1, depth: 0.00083, duration: 0.098 }],
    }),
    truth: { kind: 'planet', periodDays: 18, depthPpm: 830, note: 'An Earth-sized planet in the habitable zone of a red dwarf, orbiting every 18 days.' },
  },
  {
    id: 'sim-eclipsing-binary',
    name: 'SIM-004 · Deep and suspicious',
    kind: 'simulated',
    source: 'Simulated (looks like TESS data)',
    blurb: 'A very deep dip. Is it a giant planet, or something else? Run the checks before you decide.',
    difficulty: 'trap',
    star: SUN,
    curve: simulateCurve({
      seed: 41, days: 27.4, cadenceMin: 10, noise: 0.0007, rotationDays: 7.4, variability: 0.003, flares: 2, gap: [13.6, 14.6],
      transits: [{ period: 2.37, t0: 0.9, depth: 0.08, duration: 0.16, secondary: 0.03, oddEvenRatio: 0.9 }],
    }),
    truth: { kind: 'eclipsing-binary', periodDays: 2.37, depthPpm: 80000, note: 'Two stars orbiting each other. Deep dips, a second dip half an orbit later, and odd and even dips that differ.' },
  },
  {
    id: 'sim-quiet',
    name: 'SIM-005 · Nothing here?',
    kind: 'simulated',
    source: 'Simulated (looks like TESS data)',
    blurb: 'A star with no planet. The honest answer may be: no signal.',
    difficulty: 'medium',
    star: SUN,
    curve: simulateCurve({
      seed: 53, days: 27.4, cadenceMin: 10, noise: 0.0008, rotationDays: 5.2, variability: 0.005, flares: 5, gap: [13.6, 14.6], transits: [],
    }),
    truth: { kind: 'none', note: 'No planet. The tallest peak in the period search is just noise. Real astronomers see this often.' },
  },
];
