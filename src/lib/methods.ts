import { rng } from './simulate';

/** The five ways AstroPulse teaches. */
export type Method = 'transit' | 'rv' | 'imaging' | 'microlensing' | 'astrometry';

export const METHODS: Record<Method, { name: string; short: string; oneLine: string; color: string }> = {
  transit: { name: 'Transit (dimming)', short: 'Transit', oneLine: 'Watch a star dim a little when a planet crosses in front of it.', color: '#67e8f9' },
  rv: { name: 'Radial velocity (wobble)', short: 'Wobble', oneLine: 'A planet’s pull makes its star wobble toward and away from us.', color: '#f472b6' },
  imaging: { name: 'Direct imaging (photo)', short: 'Photo', oneLine: 'Block the star’s glare and take a picture of the planet itself.', color: '#fbbf24' },
  microlensing: { name: 'Microlensing (flash)', short: 'Flash', oneLine: 'A star passes in front of a far star and its planet adds a brief flash.', color: '#a78bfa' },
  astrometry: { name: 'Astrometry (position)', short: 'Position', oneLine: 'Measure the tiny circle a star traces on the sky as a planet tugs it.', color: '#4ade80' },
};

export const MJ_PER_MSUN = 1 / 9.546e-4;
export const EARTH_PER_MJ = 317.83;

/** Peak speed of the star's wobble in m/s (planet orbit seen edge-on). */
export function rvAmplitude(mjup: number, periodDays: number, starMass: number): number {
  return 28.4329 * mjup * Math.pow(periodDays / 365.25, -1 / 3) * Math.pow(starMass, -2 / 3);
}
/** Minimum planet mass (Jupiters) from the wobble speed K. */
export function massFromK(K: number, periodDays: number, starMass: number): number {
  return K / (28.4329 * Math.pow(periodDays / 365.25, -1 / 3) * Math.pow(starMass, -2 / 3));
}

export interface SineFit {
  amp: number;
  phase: number;
  offset: number;
  /** Fraction of the scatter the wave explains, 0 to 1. */
  r2: number;
  a: number;
  b: number;
}
/** Least-squares sine wave of a fixed period. */
export function fitSine(t: number[], y: number[], period: number): SineFit {
  const n = t.length;
  let ss = 0, cc = 0, sc = 0, s1 = 0, c1 = 0, sy = 0, cy = 0, y1 = 0;
  const w = (2 * Math.PI) / period;
  for (let i = 0; i < n; i++) {
    const s = Math.sin(w * t[i]!);
    const c = Math.cos(w * t[i]!);
    ss += s * s; cc += c * c; sc += s * c; s1 += s; c1 += c;
    sy += s * y[i]!; cy += c * y[i]!; y1 += y[i]!;
  }
  // Solve the 3x3 normal equations.
  const m = [
    [ss, sc, s1, sy],
    [sc, cc, c1, cy],
    [s1, c1, n, y1],
  ];
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(m[r]![i]!) > Math.abs(m[p]![i]!)) p = r;
    [m[i], m[p]] = [m[p]!, m[i]!];
    const d = m[i]![i]! || 1e-12;
    for (let r = i + 1; r < 3; r++) {
      const f = m[r]![i]! / d;
      for (let k = i; k < 4; k++) m[r]![k]! -= f * m[i]![k]!;
    }
  }
  const o = m[2]![3]! / (m[2]![2]! || 1e-12);
  const b = (m[1]![3]! - m[1]![2]! * o) / (m[1]![1]! || 1e-12);
  const a = (m[0]![3]! - m[0]![1]! * b - m[0]![2]! * o) / (m[0]![0]! || 1e-12);
  let sse = 0, sst = 0;
  const mean = y1 / n;
  for (let i = 0; i < n; i++) {
    const f = a * Math.sin(w * t[i]!) + b * Math.cos(w * t[i]!) + o;
    sse += (y[i]! - f) ** 2;
    sst += (y[i]! - mean) ** 2;
  }
  return { amp: Math.hypot(a, b), phase: Math.atan2(b, a), offset: o, r2: sst > 0 ? Math.max(0, 1 - sse / sst) : 0, a, b };
}

export function logSpace(lo: number, hi: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => lo * Math.pow(hi / lo, i / (n - 1)));
}

// ---------- Radial velocity ----------
export interface RvData {
  t: number[];
  v: number[];
  sigma: number;
  K: number;
  period: number;
  baseline: number;
}
export function simulateRv(o: { seed: number; period: number; mjup: number; starMass: number }): RvData {
  const r = rng(o.seed);
  const K = rvAmplitude(o.mjup, o.period, o.starMass);
  const baseline = Math.min(7000, Math.max(40, o.period * 2.8));
  const sigma = Math.max(0.35, 0.2 * K);
  const phase = r() * 6.2832;
  const t: number[] = [];
  const v: number[] = [];
  const n = 80;
  for (let i = 0; i < n; i++) t.push((i + r() * 0.9) * (baseline / n));
  t.sort((a, b) => a - b);
  for (const x of t) {
    const u = Math.max(1e-9, r());
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * r());
    v.push(K * Math.sin((2 * Math.PI * x) / o.period + phase) + sigma * g);
  }
  return { t, v, sigma, K, period: o.period, baseline };
}

// ---------- Microlensing ----------
export function lensMagnification(t: number, t0: number, tE: number, u0: number): number {
  const u = Math.sqrt(u0 * u0 + ((t - t0) / tE) ** 2);
  return (u * u + 2) / (u * Math.sqrt(u * u + 4));
}
export interface MicroData {
  t: number[];
  f: number[];
  sigma: number;
  t0: number;
  tE: number;
  u0: number;
  /** Planet blip centre (days) and full width at half height (days). */
  tp: number;
  fwhm: number;
  q: number;
  hostMass: number;
}
export function simulateMicro(o: { seed: number; mjup: number; hostMass: number }): MicroData {
  const r = rng(o.seed);
  const tE = 24 + r() * 10;
  const u0 = 0.12 + r() * 0.12;
  const t0 = 60;
  const q = Math.min(0.03, Math.max(5e-5, (o.mjup * 9.546e-4) / o.hostMass));
  const fwhm = tE * Math.sqrt(q);
  const tp = t0 - (0.45 + r() * 0.3) * tE;
  const sig = fwhm / 2.355;
  const sigma = 0.011;
  const t: number[] = [];
  const f: number[] = [];
  const lo = t0 - 2.4 * tE;
  const hi = t0 + 2.4 * tE;
  for (let x = lo; x <= hi; ) {
    t.push(x);
    x += Math.abs(x - tp) < 5 * fwhm ? Math.max(fwhm / 9, 0.01) : 0.45;
  }
  for (const x of t) {
    const A = lensMagnification(x, t0, tE, u0);
    const bump = 0.4 * lensMagnification(tp, t0, tE, u0) * Math.exp(-0.5 * ((x - tp) / sig) ** 2);
    const u = Math.max(1e-9, r());
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * r());
    f.push(A + bump + sigma * A * g);
  }
  return { t, f, sigma, t0, tE, u0, tp, fwhm, q, hostMass: o.hostMass };
}

// ---------- Astrometry ----------
export interface AstroData {
  t: number[];
  x: number[];
  y: number[];
  sigma: number;
  period: number;
  /** Semi-major axis of the star's loop, milli-arcseconds. */
  loopMas: number;
  incDeg: number;
  rotDeg: number;
}
export function planetOrbitAU(starMass: number, periodDays: number): number {
  return Math.cbrt(starMass * (periodDays / 365.25) ** 2);
}
export function simulateAstro(o: { seed: number; period: number; mjup: number; starMass: number; distLy: number }): AstroData {
  const r = rng(o.seed);
  const ap = planetOrbitAU(o.starMass, o.period);
  const aStar = (ap * o.mjup * 9.546e-4) / o.starMass;
  const loop = (aStar / (o.distLy / 3.2616)) * 1000;
  const inc = 35 + r() * 25;
  const rot = r() * 180;
  const sigma = 0.1 * loop;
  const ph = r() * 6.2832;
  const n = 60;
  const total = o.period * 2.6;
  const t: number[] = [];
  const x: number[] = [];
  const y: number[] = [];
  const ci = Math.cos((inc * Math.PI) / 180);
  const cr = Math.cos((rot * Math.PI) / 180);
  const sr = Math.sin((rot * Math.PI) / 180);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(6.2832 * r());
  for (let i = 0; i < n; i++) {
    const tt = (i + r() * 0.8) * (total / n);
    const a = (2 * Math.PI * tt) / o.period + ph;
    const px = loop * Math.cos(a);
    const py = loop * ci * Math.sin(a);
    t.push(tt);
    x.push(px * cr - py * sr + sigma * gauss());
    y.push(px * sr + py * cr + sigma * gauss());
  }
  return { t, x, y, sigma, period: o.period, loopMas: loop, incDeg: inc, rotDeg: rot };
}
/** Planet mass (Jupiters) from the star's loop. */
export function massFromLoop(loopMas: number, distLy: number, starMass: number, periodDays: number): number {
  const aStarAU = (loopMas / 1000) * (distLy / 3.2616);
  return ((aStarAU / planetOrbitAU(starMass, periodDays)) * starMass) / 9.546e-4;
}

// ---------- Direct imaging ----------
export function imagingGeometry(sepAU: number, distLy: number, starMass: number) {
  const pc = distLy / 3.2616;
  return { arcsec: sepAU / pc, periodYears: Math.sqrt(sepAU ** 3 / starMass), pc };
}
