import { mean, median, robustSigma } from './stats';
import type { StarInfo } from './types';

const R_SUN_IN_R_EARTH = 109.076;
const R_SUN_IN_R_JUP = 9.731;
const R_SUN_AU = 0.00465047;

export function foldPhase(time: number, period: number, t0: number): number {
  // Days from the nearest mid-transit, in [-period/2, period/2).
  let d = (time - t0) / period;
  d -= Math.round(d);
  return d * period;
}

export interface FoldedPoint {
  dt: number;
  flux: number;
}

export function fold(time: number[], flux: number[], period: number, t0: number): FoldedPoint[] {
  const out: FoldedPoint[] = new Array(time.length);
  for (let i = 0; i < time.length; i++) out[i] = { dt: foldPhase(time[i]!, period, t0), flux: flux[i]! };
  out.sort((a, b) => a.dt - b.dt);
  return out;
}

/** Averages a folded curve into bins for a clearer picture. */
export function binFolded(points: FoldedPoint[], binWidth: number, halfSpan: number): FoldedPoint[] {
  const nb = Math.max(1, Math.ceil((2 * halfSpan) / binWidth));
  const sum = new Array<number>(nb).fill(0);
  const cnt = new Array<number>(nb).fill(0);
  for (const p of points) {
    if (p.dt < -halfSpan || p.dt >= halfSpan) continue;
    const b = Math.min(nb - 1, Math.floor((p.dt + halfSpan) / binWidth));
    sum[b]! += p.flux;
    cnt[b]! += 1;
  }
  const out: FoldedPoint[] = [];
  for (let b = 0; b < nb; b++) if (cnt[b]) out.push({ dt: -halfSpan + (b + 0.5) * binWidth, flux: sum[b]! / cnt[b]! });
  return out;
}

export interface TransitMeasurement {
  depth: number; // fractional, e.g. 0.01 = 1 percent
  depthErr: number;
  durationDays: number;
  nTransits: number;
  nInTransit: number;
  snr: number;
}

export function measureTransit(
  time: number[],
  flux: number[],
  period: number,
  t0: number,
  durationDays: number,
): TransitMeasurement {
  const half = durationDays / 2;
  const inside: number[] = [];
  const outside: number[] = [];
  const epochs = new Set<number>();
  for (let i = 0; i < time.length; i++) {
    const dt = foldPhase(time[i]!, period, t0);
    if (Math.abs(dt) <= half * 0.8) {
      inside.push(flux[i]!);
      epochs.add(Math.round((time[i]! - t0) / period));
    } else if (Math.abs(dt) > durationDays && Math.abs(dt) < durationDays * 4) outside.push(flux[i]!);
  }
  const base = outside.length ? median(outside) : 1;
  const depth = base - (inside.length ? mean(inside) : base);
  const sigma = robustSigma(flux) || 1e-6;
  const depthErr = sigma / Math.sqrt(Math.max(1, inside.length));
  return {
    depth,
    depthErr,
    durationDays,
    nTransits: epochs.size,
    nInTransit: inside.length,
    snr: depth / depthErr,
  };
}

export interface OddEven {
  odd: number;
  even: number;
  sigma: number; // difference in units of its uncertainty
}

/** Compares transit depths of alternate events; eclipsing binaries often differ. */
export function oddEven(time: number[], flux: number[], period: number, t0: number, durationDays: number): OddEven | null {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < time.length; i++) {
    const dt = foldPhase(time[i]!, period, t0);
    if (Math.abs(dt) > durationDays * 0.4) continue;
    const n = Math.round((time[i]! - t0) / period);
    (Math.abs(n) % 2 === 0 ? a : b).push(flux[i]!);
  }
  if (a.length < 3 || b.length < 3) return null;
  const sig = robustSigma(flux) || 1e-6;
  const err = sig * Math.sqrt(1 / a.length + 1 / b.length);
  const even = 1 - mean(a);
  const odd = 1 - mean(b);
  return { odd, even, sigma: Math.abs(even - odd) / err };
}

export interface Secondary {
  depth: number;
  sigma: number;
}

/** Looks for a dip half an orbit away from the main transit. */
export function secondaryEclipse(time: number[], flux: number[], period: number, t0: number, durationDays: number): Secondary | null {
  const v: number[] = [];
  const out: number[] = [];
  for (let i = 0; i < time.length; i++) {
    const dt = foldPhase(time[i]!, period, t0 + period / 2);
    if (Math.abs(dt) <= durationDays * 0.4) v.push(flux[i]!);
    else if (Math.abs(foldPhase(time[i]!, period, t0)) > durationDays) out.push(flux[i]!);
  }
  if (v.length < 3 || out.length < 10) return null;
  const sig = robustSigma(flux) || 1e-6;
  const depth = median(out) - mean(v);
  return { depth, sigma: depth / (sig / Math.sqrt(v.length)) };
}

export function semiMajorAxisAU(periodDays: number, massSun: number): number {
  const years = periodDays / 365.25;
  return Math.cbrt(massSun * years * years);
}

export interface PlanetPhysics {
  radiusRatio: number;
  radiusEarth: number;
  radiusJupiter: number;
  semiMajorAU: number;
  /** Expected duration for a transit through the middle of the star. */
  expectedDurationDays: number;
  equilibriumK: number;
  hzInnerAU: number;
  hzOuterAU: number;
  inHabitableZone: boolean;
  luminositySun: number;
}

export function planetPhysics(star: StarInfo, periodDays: number, depth: number): PlanetPhysics {
  const k = Math.sqrt(Math.max(0, depth));
  const a = semiMajorAxisAU(periodDays, star.massSun);
  const rsAU = star.radiusSun * R_SUN_AU;
  const luminosity = star.radiusSun ** 2 * (star.teffK / 5772) ** 4;
  const sqrtL = Math.sqrt(luminosity);
  // Rough "optimistic" habitable zone (Kasting-style scaling). Not a claim of habitability.
  const hzInner = 0.75 * sqrtL;
  const hzOuter = 1.77 * sqrtL;
  return {
    radiusRatio: k,
    radiusEarth: k * star.radiusSun * R_SUN_IN_R_EARTH,
    radiusJupiter: k * star.radiusSun * R_SUN_IN_R_JUP,
    semiMajorAU: a,
    expectedDurationDays: (periodDays * rsAU) / (Math.PI * a),
    equilibriumK: star.teffK * Math.sqrt(rsAU / (2 * a)) * Math.pow(1 - 0.3, 0.25),
    hzInnerAU: hzInner,
    hzOuterAU: hzOuter,
    inHabitableZone: a >= hzInner && a <= hzOuter,
    luminositySun: luminosity,
  };
}
