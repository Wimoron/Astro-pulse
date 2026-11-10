import { API } from './api';
import { lensMagnification, type MicroData } from './methods';

export interface OglePhot { hjd: number[]; mag: number[]; err: number[] }

/**
 * Turns real OGLE photometry into the same shape the practice lab uses.
 * The hump is fitted by a simple search. The planet flash length comes from the published planet mass,
 * and its position is the biggest leftover after the fit. Returns null when the event is not clean enough.
 */
export function microFromOgle(p: OglePhot, mjup: number, hostMass: number): MicroData | null {
  const n = p.hjd.length;
  if (n < 100) return null;
  const sorted = [...p.mag].sort((a, b) => a - b);
  const base = sorted[Math.floor(n * 0.85)]!;
  const flux = p.mag.map((m) => 10 ** (-0.4 * (m - base)));
  const sig = p.err.map((e, i) => e * 0.921 * flux[i]!);
  const t0abs = p.hjd[0]!;
  const day = p.hjd.map((h) => h - t0abs);
  let kPk = 0;
  flux.forEach((v, i) => { if (v > flux[kPk]!) kPk = i; });
  if (flux[kPk]! < 1.5) return null;
  let best = { c: Infinity, t0: day[kPk]!, tE: 20, u0: 0.2 };
  for (let dt = -6; dt <= 6; dt += 1) {
    for (let tE = 4; tE <= 120; tE *= 1.12) {
      for (let u0 = 0.03; u0 <= 1; u0 *= 1.1) {
        let c = 0;
        for (let i = 0; i < n; i += 2) {
          const r = (flux[i]! - lensMagnification(day[i]!, day[kPk]! + dt, tE, u0)) / Math.max(sig[i]!, 0.005);
          c += Math.min(r * r, 25);
        }
        if (c < best.c) best = { c, t0: day[kPk]! + dt, tE, u0 };
      }
    }
  }
  const q = Math.min(0.03, Math.max(5e-5, (mjup * 9.546e-4) / hostMass));
  const fwhm = best.tE * Math.sqrt(q);
  const keep = day.map((_, i) => i).filter((i) => Math.abs(day[i]! - best.t0) <= 2.4 * best.tE);
  if (keep.length < 80) return null;
  const t = keep.map((i) => day[i]! - best.t0 + 60);
  const f = keep.map((i) => flux[i]!);
  const res = keep.map((i) => flux[i]! - lensMagnification(day[i]!, best.t0, best.tE, best.u0));
  let tp = 60, top = -Infinity;
  for (let i = 2; i < res.length - 2; i++) {
    const s = (res[i - 2]! + res[i - 1]! + res[i]! + res[i + 1]! + res[i + 2]!) / 5;
    if (Math.abs(t[i]! - 60) > 0.15 * best.tE && s > top) { top = s; tp = t[i]!; }
  }
  const med = [...keep.map((i) => p.err[i]! * 0.921)].sort((a, b) => a - b)[Math.floor(keep.length / 2)]!;
  return { t, f, sigma: Math.max(0.004, med), t0: 60, tE: best.tE, u0: best.u0, tp, fwhm, q, hostMass };
}

export async function loadOgle(event: string): Promise<OglePhot | null> {
  try {
    const r = await fetch(`${API}/api/ogle?event=${encodeURIComponent(event)}`, { signal: AbortSignal.timeout(40000) });
    if (!r.ok) return null;
    const j = (await r.json()) as Partial<OglePhot> & { none?: boolean };
    return j.hjd && j.mag && j.err ? (j as OglePhot) : null;
  } catch {
    return null;
  }
}
