import { median, robustSigma } from './stats';
import type { DetrendParams, DetrendResult, LightCurve } from './types';

/** Solves the small linear system A x = b by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    [M[c], M[p]] = [M[p]!, M[c]!];
    const piv = M[c]![c]!;
    for (let r = c + 1; r < n; r++) {
      const f = M[r]![c]! / piv;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r]![n]!;
    for (let k = r + 1; k < n; k++) s -= M[r]![k]! * x[k]!;
    x[r] = s / M[r]![r]!;
  }
  return x;
}

/** Savitzky-Golay smoothing weights for the window centre (window odd, order < window). */
export function savgolCoefficients(window: number, order: number): number[] {
  const h = (window - 1) / 2;
  const k = order + 1;
  // Normal equations (A^T A) c = e0 gives the first row of the pseudo-inverse.
  const ata: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let x = -h; x <= h; x++) {
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) ata[i]![j]! += Math.pow(x, i + j);
  }
  const e0 = new Array<number>(k).fill(0);
  e0[0] = 1;
  const c = solve(ata, e0);
  const w: number[] = [];
  for (let x = -h; x <= h; x++) {
    let s = 0;
    for (let i = 0; i < k; i++) s += c[i]! * Math.pow(x, i);
    w.push(s);
  }
  return w;
}

/** Smooths evenly spaced values; edges use odd reflection so slopes carry on. */
export function savgolSmooth(y: number[], window: number, order: number): number[] {
  const n = y.length;
  let win = window % 2 === 0 ? window + 1 : window;
  if (win > n) win = n % 2 === 0 ? n - 1 : n;
  if (win < order + 2) {
    const m = y.reduce((a, b) => a + b, 0) / Math.max(1, n);
    return new Array<number>(n).fill(m);
  }
  const h = (win - 1) / 2;
  const w = savgolCoefficients(win, order);
  const at = (i: number): number => {
    if (i < 0) return 2 * y[0]! - y[Math.min(n - 1, -i)]!;
    if (i >= n) return 2 * y[n - 1]! - y[Math.max(0, 2 * (n - 1) - i)]!;
    return y[i]!;
  };
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = -h; j <= h; j++) s += w[j + h]! * at(i + j);
    out[i] = s;
  }
  return out;
}

/** Index ranges [start, end) that are free of gaps longer than maxGapDays. */
export function segments(time: number[], maxGapDays: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let s = 0;
  for (let i = 1; i < time.length; i++) {
    if (time[i]! - time[i - 1]! > maxGapDays) {
      out.push([s, i]);
      s = i;
    }
  }
  if (time.length) out.push([s, time.length]);
  return out;
}

export function cadenceDays(time: number[]): number {
  const d: number[] = [];
  for (let i = 1; i < time.length; i++) d.push(time[i]! - time[i - 1]!);
  return median(d);
}

/**
 * Removes slow stellar variability and spacecraft drift.
 * 1. Smooth each continuous stretch with a Savitzky-Golay filter.
 * 2. Mark upward spikes (flares) above clipSigma, replace them by the trend, smooth again.
 * 3. Divide the trend out and drop the spikes.
 */
export function detrend(curve: LightCurve, p: DetrendParams): DetrendResult {
  const { time, flux } = curve;
  const n = time.length;
  const cad = cadenceDays(time) || 0.00139;
  const window = Math.max(5, Math.round(p.windowDays / cad));
  const segs = segments(time, Math.max(5 * cad, 0.2));

  const smoothAll = (values: number[]): number[] => {
    const trend = new Array<number>(n);
    for (const [a, b] of segs) {
      const part = savgolSmooth(values.slice(a, b), window, p.order);
      for (let i = a; i < b; i++) trend[i] = part[i - a]!;
    }
    return trend;
  };

  // Points the trend must not follow: flares (up) and sharp dips (down, such as a transit).
  // Masked points are replaced by a straight line between their unmasked neighbours,
  // so the smooth line passes over a dip instead of sinking into it.
  const segOf = new Array<number>(n).fill(0);
  segs.forEach(([a, b], si) => {
    for (let i = a; i < b; i++) segOf[i] = si;
  });
  const fill = (mask: boolean[]): number[] => {
    const out = flux.slice();
    let i = 0;
    while (i < n) {
      if (!mask[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j < n && mask[j]) j++;
      const avg = (from: number, step: number): number => {
        let sum = 0;
        let k = 0;
        for (let q = from; q >= 0 && q < n && k < 5 && segOf[q] === segOf[i]; q += step) {
          if (!mask[q]) {
            sum += flux[q]!;
            k++;
          }
        }
        return k ? sum / k : NaN;
      };
      const left = i > 0 ? avg(i - 1, -1) : NaN;
      const right = j < n ? avg(j, 1) : NaN;
      for (let q = i; q < j; q++) {
        const l = Number.isFinite(left) ? left : right;
        const r = Number.isFinite(right) ? right : left;
        const w = (q - i + 1) / (j - i + 1);
        out[q] = Number.isFinite(l) ? l * (1 - w) + r * w : flux[q]!;
      }
      i = j;
    }
    return out;
  };

  const DIP_SIGMA = 4;
  const grow = Math.max(1, Math.round(0.025 / cad));
  // A smooth curve can dive into a dip sitting right at the edge of the data. There, start from a
  // running median instead (it ignores short dips); the middle of the data is left exactly as before.
  const medAll = (values: number[]): number[] => {
    const out = new Array<number>(n);
    const half = Math.max(2, Math.floor(window / 2));
    for (const [a, b] of segs) {
      for (let i = a; i < b; i++) out[i] = median(values.slice(Math.max(a, i - half), Math.min(b, i + half + 1)));
    }
    return out;
  };
  let trend = smoothAll(flux);
  {
    const alt = smoothAll(medAll(flux));
    const sig0 = robustSigma(flux.map((f, i) => f / trend[i]! - 1));
    const edge = Math.max(2, Math.floor(window / 2));
    for (const [a, b] of segs) {
      for (let i = a; i < b; i++) if ((i - a < edge || b - 1 - i < edge) && Math.abs(alt[i]! / trend[i]! - 1) > 6 * sig0) trend[i] = alt[i]!;
    }
  }
  const isSpike = new Array<boolean>(n).fill(false);
  const isDip = new Array<boolean>(n).fill(false);
  for (let pass = 0; pass < 4; pass++) {
    const resid = flux.map((f, i) => f / trend[i]! - 1);
    const sigma = robustSigma(resid);
    const base = median(resid);
    let changed = false;
    const rawDip = resid.map((r) => r - base < -DIP_SIGMA * sigma);
    for (let i = 0; i < n; i++) {
      const spike = resid[i]! - base > p.clipSigma * sigma;
      let dip = false;
      for (let k = Math.max(0, i - grow); k <= Math.min(n - 1, i + grow) && !dip; k++) dip = rawDip[k]!;
      if (spike !== isSpike[i] || dip !== isDip[i]) changed = true;
      isSpike[i] = spike;
      isDip[i] = dip && !spike;
    }
    if (!changed && pass > 0) break;
    trend = smoothAll(fill(isSpike.map((x, i) => x || isDip[i]!)));
  }

  const t: number[] = [];
  const f: number[] = [];
  let removed = 0;
  for (let i = 0; i < n; i++) {
    if (isSpike[i] || !Number.isFinite(flux[i]!) || !Number.isFinite(trend[i]!)) {
      removed++;
      continue;
    }
    t.push(time[i]!);
    f.push(flux[i]! / trend[i]!);
  }
  return { time: t, flux: f, trend, removed, sigma: robustSigma(f) };
}
