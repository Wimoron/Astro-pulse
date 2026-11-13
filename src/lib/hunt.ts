import { detrend } from './detrend';
import { bls } from './bls';
import { foldPhase } from './physics';
import { rng, simulateCurve, type SimSpec } from './simulate';
import { median, robustSigma } from './stats';
import type { LightCurve } from './types';

export type Verdict = 'planet' | 'binary' | 'none';
export type Tier = 0 | 1 | 2 | 3;

export interface Puzzle {
  seed: number;
  tier: Tier;
  name: string;
  curve: LightCurve;
  truth: { kind: Verdict; periodDays: number | null; depthPpm: number | null; note: string };
}

export const TIER_NAME = ['Easy', 'Medium', 'Hard', 'Very hard'] as const;
const WEEK_TIER: Tier[] = [2, 0, 0, 1, 1, 2, 3]; // Sunday first

/** Whole days since 1970, in the player's own time zone. */
export function dayIndex(d = new Date()): number {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}
/** New players start gently: Easy for their first 7 days of play, then the normal weekly mix. */
export const GENTLE_DAYS = 7;
export function inGentlePeriod(l: HuntLog, today: number): boolean {
  const played = Object.keys(l.days).map(Number).filter((n) => Number.isFinite(n));
  if (!played.length) return true;
  return today - Math.min(...played) < GENTLE_DAYS;
}
export function tierForDay(day: number): Tier {
  return WEEK_TIER[(day + 4) % 7]!; // day 0 (1 Jan 1970) was a Thursday
}

const between = (r: () => number, a: number, b: number) => a + (b - a) * r();
const logBetween = (r: () => number, a: number, b: number) => Math.exp(between(r, Math.log(a), Math.log(b)));

/** Builds the same puzzle for the same seed and tier, on any phone. */
export function makePuzzle(seed: number, tier: Tier): Puzzle {
  const r = rng(seed * 7919 + 17);
  const u = r();
  const kind: Verdict = u < 0.2 ? 'binary' : u < 0.38 ? 'none' : 'planet';
  const depthRange: Array<[number, number]> = [[0.012, 0.02], [0.004, 0.007], [0.0016, 0.0026], [0.0008, 0.0012]];
  const noise = [0.0005, 0.0007, 0.0008, 0.0008][tier]!;
  const days = 27.4;
  const base = { seed: seed + 101, days, cadenceMin: 10, noise, rotationDays: between(r, 3, 12), variability: between(r, 0.002, 0.008) * (tier + 1) * 0.6, flares: Math.floor(between(r, 1, 6)), gap: [13.6, 14.4] as [number, number] };
  let spec: SimSpec;
  let period: number | null = null;
  let depth: number | null = null;
  let note: string;
  if (kind === 'planet') {
    period = Math.round(logBetween(r, 1.2, 10.5) * 1000) / 1000;
    depth = between(r, ...depthRange[tier]!);
    const dur = 0.1 * Math.pow(period / 3, 1 / 3) * between(r, 0.8, 1.2);
    spec = { ...base, transits: [{ period, t0: between(r, 0.5, period), depth, duration: dur }] };
    note = `A real-looking planet: it passes in front of its star every ${period.toFixed(2)} days and blocks about ${Math.round(depth * 1e4) / 100}% of the light.`;
  } else if (kind === 'binary') {
    period = Math.round(logBetween(r, 0.9, 6) * 1000) / 1000;
    depth = between(r, 0.05, 0.12);
    spec = { ...base, transits: [{ period, t0: between(r, 0.5, period), depth, duration: 0.16, secondary: depth * between(r, 0.25, 0.5), oddEvenRatio: between(r, 0.8, 0.93) }] };
    note = `A false alarm: two stars circling each other, one eclipsing the other every ${period.toFixed(2)} days. Clues: the dips are deep, alternate dips differ, and there is a second dip halfway between.`;
  } else {
    spec = { ...base, variability: base.variability * 1.8, flares: base.flares + 4, transits: [] };
    note = 'Nothing there. The wobble is a spotted star turning, and the spikes are flares. No planet crosses this star.';
  }
  return {
    seed,
    tier,
    name: `Hunt ${String(seed % 10000).padStart(4, '0')}`,
    curve: simulateCurve(spec),
    truth: { kind, periodDays: period, depthPpm: depth === null ? null : Math.round(depth * 1e6), note },
  };
}

/** Wobble removed, ready for folding. */
export function cleaned(curve: LightCurve): LightCurve {
  const d = detrend(curve, { windowDays: 1, order: 2, clipSigma: 4 });
  return { time: d.time, flux: d.flux };
}

export interface Fold {
  t0: number;
  /** Depth of the darkest part of the fold (fraction of the star's light), and how strong it is against the noise. */
  depth: number;
  strength: number;
  /** Folded points: days from the middle of the dip, flux. */
  dt: number[];
  flux: number[];
}

/** Folds at a period you chose; the darkest part of the orbit is centred automatically. */
export function foldAt(c: LightCurve, period: number): Fold {
  const nb = 60;
  const sum = new Float64Array(nb);
  const cnt = new Float64Array(nb);
  for (let i = 0; i < c.time.length; i++) {
    const ph = (((c.time[i]! / period) % 1) + 1) % 1;
    const b = Math.min(nb - 1, Math.floor(ph * nb));
    sum[b]! += c.flux[i]!;
    cnt[b]! += 1;
  }
  // Darkest run of 3 neighbouring bins.
  let bestB = 0;
  let bestV = Infinity;
  for (let b = 0; b < nb; b++) {
    let s = 0;
    let n = 0;
    for (let k = -1; k <= 1; k++) {
      const j = (b + k + nb) % nb;
      s += sum[j]!;
      n += cnt[j]!;
    }
    if (n > 0 && s / n < bestV) {
      bestV = s / n;
      bestB = b;
    }
  }
  const t0 = ((bestB + 0.5) / nb) * period;
  const dt: number[] = [];
  const flux: number[] = [];
  for (let i = 0; i < c.time.length; i++) {
    dt.push(foldPhase(c.time[i]!, period, t0));
    flux.push(c.flux[i]!);
  }
  const base = median(c.flux);
  const sigma = robustSigma(c.flux) || 1e-6;
  // Number of points that sit in the darkest three bins.
  let n = 0;
  for (let j = -1; j <= 1; j++) n += cnt[(bestB + j + nb) % nb]!;
  const depth = Math.max(0, base - bestV);
  const strength = n > 0 ? depth / (sigma / Math.sqrt(n)) : 0;
  return { t0, depth, strength, dt, flux };
}

/** The "help me" button: the period the box search finds. */
export function autoPeriod(c: LightCurve): number {
  const r = bls(c.time, c.flux, { minPeriod: 0.8, maxPeriod: 12, durations: [0.06, 0.1, 0.15, 0.2] });
  return r.best.period;
}

export interface Score {
  total: number;
  verdictPts: number;
  periodPts: number;
  helpCost: number;
  lines: string[];
}

/** 100 points: 50 for the right verdict, 50 for the period (a half or double period earns a little). */
export function score(p: { truth: { kind: Verdict; periodDays: number | null } }, verdict: Verdict, period: number | null, usedHelp: boolean): Score {
  const lines: string[] = [];
  const t = p.truth;
  const verdictPts = verdict === t.kind ? 50 : 0;
  lines.push(verdict === t.kind ? 'Right call.' : `Wrong call: this was ${t.kind === 'planet' ? 'a planet' : t.kind === 'binary' ? 'a binary star' : 'nothing at all'}.`);
  let periodPts = 0;
  if (t.kind === 'none') {
    periodPts = verdict === 'none' ? 50 : 0;
  } else if (verdict !== 'none' && period && t.periodDays) {
    const err = Math.abs(period - t.periodDays) / t.periodDays;
    const half = Math.abs(period * 2 - t.periodDays) / t.periodDays;
    const dbl = Math.abs(period / 2 - t.periodDays) / t.periodDays;
    if (err <= 0.1) periodPts = Math.round(50 * (1 - err / 0.1));
    else if (Math.min(half, dbl) <= 0.03) {
      periodPts = 15;
      lines.push(half < dbl ? 'Your period is half the real one: you counted every dip, but the real orbit is twice as long.' : 'Your period is double the real one: two dips fit in one orbit.');
    }
    lines.push(err <= 0.02 ? 'Period nailed.' : err <= 0.1 ? 'Period close.' : `Period was ${t.periodDays.toFixed(3)} days, you said ${period.toFixed(3)}.`);
  }
  const helpCost = usedHelp ? Math.min(25, verdictPts + periodPts) : 0;
  if (usedHelp) lines.push('Auto-search used: -25 points.');
  return { total: Math.max(0, verdictPts + periodPts - helpCost), verdictPts, periodPts, helpCost, lines };
}

export function rank(total: number): string {
  return total >= 90 ? 'Discovery' : total >= 70 ? 'Strong find' : total >= 40 ? 'Getting there' : 'Back to the data';
}

/* ---- Progress saved on this phone ---- */

export interface HuntLog {
  /** Day index to points. */
  days: Record<string, { pts: number; verdict: Verdict }>;
  practice: number;
}
const KEY = 'ap-hunt-v1';

export function loadHunt(): HuntLog {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? 'null') as HuntLog | null;
    if (j && typeof j === 'object' && j.days) return { days: j.days, practice: Number(j.practice) || 0 };
  } catch {
    /* blocked or corrupt storage */
  }
  return { days: {}, practice: 0 };
}
export function saveHunt(l: HuntLog) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* storage can be full or blocked */
  }
}

/** Days in a row, counting back from today (or from yesterday if today is not played yet). */
export function streak(l: HuntLog, today: number): number {
  let d = l.days[String(today)] ? today : today - 1;
  let n = 0;
  while (l.days[String(d)]) {
    n++;
    d--;
  }
  return n;
}
