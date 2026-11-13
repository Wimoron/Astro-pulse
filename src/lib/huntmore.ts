import { lensMagnification } from './methods';
import type { Method } from './methods';
import { rng } from './simulate';
import { score, type Tier, type Verdict } from './hunt';
import type { Score } from './hunt';

/** Which method today's puzzle uses. Every block of 5 days covers all five methods, in a different order each block. */
export function methodForDay(day: number): Method {
  const all: Method[] = ['transit', 'rv', 'imaging', 'microlensing', 'astrometry'];
  const r = rng(Math.floor(day / 5) * 977 + 31);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  return all[((day % 5) + 5) % 5]!;
}
/** Practice puzzles: any method at random. */
export function methodForSeed(seed: number): Method {
  const all: Method[] = ['transit', 'rv', 'imaging', 'microlensing', 'astrometry'];
  return all[Math.floor(rng(seed * 31 + 5)() * 5)]!;
}

const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r());
const between = (r: () => number, a: number, b: number) => a + (b - a) * r();

/* ---------------- Wobble (radial velocity) ---------------- */
export interface RvPuzzle {
  method: 'rv';
  name: string;
  t: number[];
  v: number[];
  truth: { kind: Verdict; periodDays: number | null; note: string };
}
export function makeRv(seed: number, tier: Tier): RvPuzzle {
  const r = rng(seed * 6007 + 3);
  const u = r();
  const kind: Verdict = u < 0.2 ? 'binary' : u < 0.38 ? 'none' : 'planet';
  const K = [60, 36, 22, 15][tier]!;
  const sigma = [4, 5, 6, 6][tier]!;
  const days = 60;
  const n = 46;
  const t: number[] = [];
  for (let i = 0; i < n; i++) t.push((i + r()) * (days / n));
  const period = kind === 'none' ? null : Math.round(Math.exp(between(r, Math.log(kind === 'planet' ? 1.6 : 2.5), Math.log(kind === 'planet' ? 14 : 18))) * 1000) / 1000;
  const amp = kind === 'planet' ? K : kind === 'binary' ? between(r, 4000, 14000) : 0;
  const ph = r() * 2 * Math.PI;
  const drift = kind === 'none' ? between(r, -0.25, 0.25) : 0;
  const v = t.map((x) => (period ? amp * Math.sin((2 * Math.PI * x) / period + ph) : 0) + drift * x + sigma * gauss(r) * (kind === 'binary' ? 4 : 1));
  const note =
    kind === 'planet'
      ? `A planet. Its pull makes the star swing toward and away from us every ${period!.toFixed(2)} days, by about ${Math.round(amp)} m/s.`
      : kind === 'binary'
        ? `Two stars. The swing is about ${Math.round(amp).toLocaleString()} m/s, far too big for a planet (planets move a star by 1 to 200 m/s). A companion star pulls much harder.`
        : 'Nothing there. The small ups and downs are measuring noise and a slow drift. No pattern repeats.';
  return { method: 'rv', name: `Hunt ${String(seed % 10000).padStart(4, '0')}`, t, v, truth: { kind, periodDays: period, note } };
}

export interface RvFold {
  phase: number[];
  v: number[];
  bx: number[];
  by: number[];
  strength: number;
}
/** Folds the speeds at a chosen repeat time; `strength` says how much of the scatter the fold explains. */
export function foldRv(t: number[], v: number[], period: number): RvFold {
  const nb = 12;
  const sum = new Float64Array(nb);
  const cnt = new Float64Array(nb);
  const phase = t.map((x) => (((x / period) % 1) + 1) % 1);
  phase.forEach((p, i) => {
    const b = Math.min(nb - 1, Math.floor(p * nb));
    sum[b]! += v[i]!;
    cnt[b]! += 1;
  });
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, v.length - 1)) || 1;
  const bx: number[] = [];
  const by: number[] = [];
  let ss = 0;
  for (let b = 0; b < nb; b++) {
    if (!cnt[b]) continue;
    const mu = sum[b]! / cnt[b]!;
    bx.push((b + 0.5) / nb);
    by.push(mu);
    ss += cnt[b]! * (mu - m) ** 2;
  }
  // Share of the total scatter that the fold explains, scaled so noise sits near 0 and a clean signal near 1.
  const share = ss / (sd * sd * (v.length - 1));
  const expected = (nb - 1) / (v.length - 1);
  return { phase, v, bx, by, strength: Math.max(0, Math.min(1, (share - expected) / (1 - expected))) };
}
export function autoPeriodRv(t: number[], v: number[]): number {
  let best = 1;
  let bs = -1;
  for (let i = 0; i < 500; i++) {
    const p = 1 * Math.pow(30, i / 499);
    const s = foldRv(t, v, p).strength;
    if (s > bs) {
      bs = s;
      best = p;
    }
  }
  return best;
}

/* ---------------- Flash (microlensing) ---------------- */
export interface MicroPuzzle {
  method: 'microlensing';
  name: string;
  t: number[];
  f: number[];
  smooth: number[];
  truth: { kind: Verdict; periodDays: null; note: string };
}
export function makeMicro(seed: number, tier: Tier): MicroPuzzle {
  const r = rng(seed * 7001 + 11);
  const kind: Verdict = r() < 0.5 ? 'planet' : 'none';
  const t0 = between(r, 26, 34);
  const tE = between(r, 9, 15);
  const u0 = between(r, 0.1, 0.3);
  const sigma = 0.012;
  const amp = [0.4, 0.22, 0.13, 0.08][tier]!;
  const fwhm = [1.8, 1.4, 1.1, 0.9][tier]!;
  const tp = t0 + (r() < 0.5 ? -1 : 1) * between(r, 0.4, 0.9) * tE;
  const t: number[] = [];
  for (let x = 0; x <= 60; x += 0.2) if (r() > 0.22) t.push(Math.round(x * 100) / 100);
  const smooth = t.map((x) => lensMagnification(x, t0, tE, u0));
  const sig = fwhm / 2.355;
  const f = t.map((x, i) => {
    const A = smooth[i]!;
    const bump = kind === 'planet' ? amp * lensMagnification(tp, t0, tE, u0) * Math.exp(-0.5 * ((x - tp) / sig) ** 2) : 0;
    return A + bump + sigma * A * gauss(r);
  });
  const note =
    kind === 'planet'
      ? `A planet. Near day ${tp.toFixed(0)} the data leave the smooth curve for about a day: the planet's own gravity added a short extra bump to the flash.`
      : 'Just a star. All the points follow the smooth curve. One star drifted in front of another and brightened it, with no planet.';
  return { method: 'microlensing', name: `Hunt ${String(seed % 10000).padStart(4, '0')}`, t, f, smooth, truth: { kind, periodDays: null, note } };
}

/* ---------------- Position (astrometry) ---------------- */
export interface AstroPuzzle {
  method: 'astrometry';
  name: string;
  t: number[];
  x: number[];
  y: number[];
  /** Half-width of the square the data fit in (milli-arcseconds). */
  range: number;
  truth: { kind: Verdict; periodDays: null; note: string };
}
export function makeAstro(seed: number, tier: Tier): AstroPuzzle {
  const r = rng(seed * 8009 + 17);
  const kind: Verdict = r() < 0.5 ? 'planet' : 'none';
  const loop = between(r, 0.5, 1.2);
  const sigma = loop / [6, 4, 2.7, 1.9][tier]!;
  const period = between(r, 0.7, 1.3);
  const n = 36;
  const inc = between(r, 0.45, 1);
  const rot = r() * Math.PI;
  const ph = r() * 2 * Math.PI;
  const t: number[] = [];
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const tt = (i + r() * 0.7) * (2.2 / n);
    t.push(tt);
    const a = (2 * Math.PI * tt) / period + ph;
    const px = kind === 'planet' ? loop * Math.cos(a) : 0;
    const py = kind === 'planet' ? loop * inc * Math.sin(a) : 0;
    x.push(px * Math.cos(rot) - py * Math.sin(rot) + sigma * gauss(r));
    y.push(px * Math.sin(rot) + py * Math.cos(rot) + sigma * gauss(r));
  }
  const range = Math.ceil((loop + 3 * sigma) * 10) / 10 * 1.15;
  const note =
    kind === 'planet'
      ? `A planet. The star's position goes round a loop about ${(loop * 2).toFixed(1)} milli-arcseconds wide, about once a year, because the planet tugs it around.`
      : 'Nothing there. The positions are a random cloud around one spot, just measuring error. No loop.';
  return { method: 'astrometry', name: `Hunt ${String(seed % 10000).padStart(4, '0')}`, t, x, y, range, truth: { kind, periodDays: null, note } };
}

/* ---------------- Photo (direct imaging) ---------------- */
export const IMG = 96;
export interface ImgPuzzle {
  method: 'imaging';
  name: string;
  frames: [Float32Array, Float32Array];
  /** Planet position in each picture (pixels), or null when there is none. */
  planet: [[number, number], [number, number]] | null;
  decoys: Array<[number, number]>;
  truth: { kind: Verdict; periodDays: null; note: string };
}
function renderFrame(seed: number, planet: [number, number] | null, decoys: Array<[number, number]>, P: number): Float32Array {
  const r = rng(seed);
  const a = new Float32Array(IMG * IMG);
  const c = IMG / 2;
  // Speckles: new random blobs each picture.
  const blobs = Array.from({ length: 38 }, () => {
    const ang = r() * 2 * Math.PI;
    const rad = 6 + Math.sqrt(r()) * 30;
    return { x: c + rad * Math.cos(ang), y: c + rad * Math.sin(ang), h: P * 0.55 * r() * (1.3 - rad / 40) };
  });
  const dot = (x0: number, y0: number, h: number, s: number) => {
    const x1 = Math.max(0, Math.floor(x0 - 4 * s)), x2 = Math.min(IMG - 1, Math.ceil(x0 + 4 * s));
    const y1 = Math.max(0, Math.floor(y0 - 4 * s)), y2 = Math.min(IMG - 1, Math.ceil(y0 + 4 * s));
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) a[y * IMG + x]! += h * Math.exp(-((x - x0) ** 2 + (y - y0) ** 2) / (2 * s * s));
  };
  for (let y = 0; y < IMG; y++)
    for (let x = 0; x < IMG; x++) {
      const d2 = (x - c) ** 2 + (y - c) ** 2;
      a[y * IMG + x] = 400 * Math.exp(-d2 / (2 * 2.4 * 2.4)) + 5 * P / Math.pow(1 + d2 / 40, 1.1) + 0.02 * gauss(r);
    }
  blobs.forEach((b) => dot(b.x, b.y, b.h, 1.5));
  decoys.forEach(([x, y]) => dot(x, y, P * 1.0, 1.4));
  if (planet) dot(planet[0], planet[1], P, 1.4);
  return a;
}
export function makeImaging(seed: number, tier: Tier): ImgPuzzle {
  const r = rng(seed * 9001 + 23);
  const kind: Verdict = r() < 0.7 ? 'planet' : 'none';
  const P = [1.1, 0.8, 0.6, 0.45][tier]!;
  const c = IMG / 2;
  const decoys: Array<[number, number]> = [];
  const nd = 2 + Math.floor(r() * 2);
  for (let i = 0; i < nd; i++) {
    const rad = between(r, 18, 42);
    const ang = r() * 2 * Math.PI;
    decoys.push([c + rad * Math.cos(ang), c + rad * Math.sin(ang)]);
  }
  let planet: ImgPuzzle['planet'] = null;
  if (kind === 'planet') {
    const rad = between(r, 15, 36);
    const a0 = r() * 2 * Math.PI;
    const da = (r() < 0.5 ? -1 : 1) * between(r, 0.5, 1.2);
    planet = [
      [c + rad * Math.cos(a0), c + rad * Math.sin(a0)],
      [c + rad * Math.cos(a0 + da), c + rad * Math.sin(a0 + da)],
    ];
  }
  const frames: [Float32Array, Float32Array] = [renderFrame(seed * 13 + 1, planet ? planet[0] : null, decoys, P), renderFrame(seed * 13 + 2, planet ? planet[1] : null, decoys, P)];
  const note =
    kind === 'planet'
      ? 'A planet. It is the dot that moved around the star between the two pictures. The other dots stayed put, so they are distant background stars.'
      : 'Nothing there. Every dot stayed in the same place, so they are all distant background stars. The blotchy speckles changed because they are just glare.';
  return { method: 'imaging', name: `Hunt ${String(seed % 10000).padStart(4, '0')}`, frames, planet, decoys, truth: { kind, periodDays: null, note } };
}

/** Imaging answer: null means "nothing here". Tapping within 6 pixels of the planet in the shown picture counts. */
export function scoreImaging(p: ImgPuzzle, tap: { frame: 0 | 1; x: number; y: number } | null): Score {
  if (!p.planet) {
    return tap ? { total: 0, verdictPts: 0, periodPts: 0, helpCost: 0, lines: ['That dot did not move, so it is a background star. There was no planet.'] } : { total: 100, verdictPts: 50, periodPts: 50, helpCost: 0, lines: ['Right call. Every dot stayed put.'] };
  }
  if (!tap) return { total: 0, verdictPts: 0, periodPts: 0, helpCost: 0, lines: ['There was a planet. It is the dot that moved between the pictures.'] };
  const [px, py] = p.planet[tap.frame];
  const d = Math.hypot(tap.x - px, tap.y - py);
  return d <= 6 ? { total: 100, verdictPts: 50, periodPts: 50, helpCost: 0, lines: ['Found it. That dot moved around the star.'] } : { total: 0, verdictPts: 0, periodPts: 0, helpCost: 0, lines: ['That was not the planet. It was a dot that stayed in place, or glare.'] };
}

/** Simple yes/no puzzles (flash, position): 100 for the right call. */
export function scoreCall(truth: Verdict, said: Verdict): Score {
  const ok = truth === said;
  return { total: ok ? 100 : 0, verdictPts: ok ? 100 : 0, periodPts: 0, helpCost: 0, lines: [ok ? 'Right call.' : `Wrong call: this was ${truth === 'planet' ? 'a planet' : 'nothing at all'}.`] };
}
export { score };
