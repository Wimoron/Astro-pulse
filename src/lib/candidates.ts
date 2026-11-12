import { API, NO_SERVER } from './api';
import { bls } from './bls';
import { cleaned } from './hunt';
import { oddEven, secondaryEclipse } from './physics';
import type { LightCurve } from './types';

/** A planet candidate from NASA's TESS Objects of Interest list that nobody has confirmed yet. */
export interface Candidate {
  toi: string;
  tic: string;
  ra: number;
  dec: number;
  mag: number | null;
  periodDays: number;
  durationHours: number;
  depthPpm: number;
  radiusEarth: number | null;
  /** PC = candidate, APC = ambiguous candidate. */
  status: string;
}

export type Disposition = 'CP' | 'KP' | 'FP' | 'FA' | 'PC' | 'APC' | string;

export interface Reading {
  period: number;
  durationDays: number;
  depth: number;
  snr: number;
  /** Odd and even dips differ by this many sigma (big = suspicious). */
  oddEvenSigma: number | null;
  /** A dip halfway round the orbit, in sigma (big = suspicious). */
  secondarySigma: number | null;
  /** Folded points around the dip. */
  fold: { dt: number[]; flux: number[] };
  flags: string[];
}

/** Measures the candidate's real light curve near the period NASA lists. */
export function readCandidate(raw: LightCurve, c: Pick<Candidate, 'periodDays' | 'durationHours'>): Reading | null {
  const lc = cleaned(raw);
  if (lc.time.length < 200) return null;
  const dur = Math.max(0.03, c.durationHours / 24);
  const r = bls(lc.time, lc.flux, { minPeriod: c.periodDays * 0.97, maxPeriod: c.periodDays * 1.03, durations: [dur * 0.7, dur, dur * 1.4] });
  const b = r.best;
  const oe = oddEven(lc.time, lc.flux, b.period, b.t0, b.durationDays);
  const sec = secondaryEclipse(lc.time, lc.flux, b.period, b.t0, b.durationDays);
  const dt: number[] = [];
  const flux: number[] = [];
  const half = Math.max(b.durationDays * 4, 0.3);
  for (let i = 0; i < lc.time.length; i++) {
    let d = (lc.time[i]! - b.t0) / b.period;
    d = (d - Math.round(d)) * b.period;
    if (Math.abs(d) <= half) {
      dt.push(d);
      flux.push(lc.flux[i]!);
    }
  }
  const flags: string[] = [];
  if (b.snr < 7) flags.push('The dip is weak against the noise in this one sector.');
  if (oe && oe.sigma > 3) flags.push('Alternate dips have different depths: a sign of two stars eclipsing.');
  if (sec && sec.sigma > 3 && sec.depth > 0) flags.push('There is a second dip halfway round the orbit: another sign of two stars.');
  if (!flags.length) flags.push('No obvious warning signs in this sector.');
  return { period: b.period, durationDays: b.durationDays, depth: b.depth, snr: b.snr, oddEvenSigma: oe ? oe.sigma : null, secondarySigma: sec ? sec.sigma : null, fold: { dt, flux }, flags };
}

export type Call = 'planet' | 'false';
export interface Finding {
  toi: string;
  call: Call;
  at: number;
  /** NASA's answer, filled in when it changes from PC. */
  nasa?: Disposition;
}

const KEY = 'ap-findings-v1';
export function loadFindings(): Finding[] {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Finding[];
    return Array.isArray(j) ? j.filter((f) => f && typeof f.toi === 'string') : [];
  } catch {
    return [];
  }
}
export function saveFindings(f: Finding[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(f.slice(0, 500)));
  } catch {
    /* storage can be full or blocked */
  }
}

/** Did NASA's later answer agree with the call? Null while still open. */
export function verdictOf(f: Finding): 'right' | 'wrong' | null {
  const n = f.nasa;
  if (!n || n === 'PC' || n === 'APC') return null;
  const planet = n === 'CP' || n === 'KP';
  return planet === (f.call === 'planet') ? 'right' : 'wrong';
}

export const serverReady = !NO_SERVER;

export async function loadCandidates(): Promise<Candidate[]> {
  const r = await fetch(`${API}/api/candidates`, { signal: AbortSignal.timeout(60000) });
  const j = (await r.json().catch(() => ({}))) as { candidates?: Candidate[]; error?: string };
  if (!r.ok || !j.candidates) throw new Error(j.error ?? `server answered ${r.status}`);
  return j.candidates;
}

export async function loadDispositions(tois: string[]): Promise<Record<string, Disposition>> {
  if (!tois.length) return {};
  const r = await fetch(`${API}/api/candidates?ids=${encodeURIComponent(tois.slice(0, 40).join(','))}`, { signal: AbortSignal.timeout(60000) });
  const j = (await r.json().catch(() => ({}))) as { status?: Record<string, Disposition>; error?: string };
  if (!r.ok || !j.status) throw new Error(j.error ?? `server answered ${r.status}`);
  return j.status;
}
