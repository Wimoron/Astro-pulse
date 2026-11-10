import { mean, robustSigma } from './stats';
import type { BlsOptions, BlsPeak, BlsResult } from './types';

/** Averages points into time bins so the period search stays fast on long light curves. */
export function binTime(time: number[], flux: number[], binDays: number): { time: number[]; flux: number[]; count: number[] } {
  const t: number[] = [];
  const f: number[] = [];
  const c: number[] = [];
  if (!time.length) return { time: t, flux: f, count: c };
  let start = time[0]!;
  let st = 0;
  let sf = 0;
  let n = 0;
  const flush = () => {
    if (n) {
      t.push(st / n);
      f.push(sf / n);
      c.push(n);
    }
    st = sf = n = 0;
  };
  for (let i = 0; i < time.length; i++) {
    if (time[i]! - start >= binDays) {
      flush();
      start = time[i]!;
    }
    st += time[i]!;
    sf += flux[i]!;
    n++;
  }
  flush();
  return { time: t, flux: f, count: c };
}

interface Best {
  power: number;
  depth: number;
  t0: number;
  dur: number;
  nIn: number;
}

/** Best box for one trial period using phase bins and running sums. */
function scanPeriod(
  time: number[],
  y: number[],
  period: number,
  durations: number[],
  nBins: number,
  sums: Float64Array,
  counts: Float64Array,
  tRef: number,
): Best {
  sums.fill(0);
  counts.fill(0);
  const binW = period / nBins;
  for (let i = 0; i < time.length; i++) {
    let ph = (time[i]! - tRef) / period;
    ph -= Math.floor(ph);
    const b = Math.min(nBins - 1, Math.floor(ph * nBins));
    sums[b]! += y[i]!;
    counts[b]! += 1;
  }
  let totalS = 0;
  let totalN = 0;
  for (let b = 0; b < nBins; b++) {
    totalS += sums[b]!;
    totalN += counts[b]!;
  }
  const best: Best = { power: 0, depth: 0, t0: tRef, dur: durations[0]!, nIn: 0 };
  for (const dur of durations) {
    const w = Math.max(1, Math.round(dur / binW));
    if (w >= nBins / 2) continue;
    let inS = 0;
    let inN = 0;
    for (let b = 0; b < w; b++) {
      inS += sums[b]!;
      inN += counts[b]!;
    }
    for (let start = 0; start < nBins; start++) {
      if (start > 0) {
        const out = start - 1;
        const inn = (start + w - 1) % nBins;
        inS += sums[inn]! - sums[out]!;
        inN += counts[inn]! - counts[out]!;
      }
      const outN = totalN - inN;
      if (inN < 3 || outN < 3) continue;
      const depth = (totalS - inS) / outN - inS / inN; // positive when the box is dimmer
      if (depth <= 0) continue;
      const power = (depth * depth * inN * outN) / totalN;
      if (power > best.power) {
        best.power = power;
        best.depth = depth;
        best.nIn = inN;
        best.dur = w * binW;
        best.t0 = tRef + (start + w / 2) * binW;
      }
    }
  }
  return best;
}

/**
 * Box Least Squares period search (Kovacs et al. 2002, binned form).
 * Looks for the repeating box-shaped dip that best explains the light curve.
 */
export function bls(timeIn: number[], fluxIn: number[], opt: BlsOptions): BlsResult {
  const binned = binTime(timeIn, fluxIn, 10 / 1440);
  const time = binned.time;
  const m = mean(binned.flux);
  const y = binned.flux.map((v) => v - m);
  const baseline = time[time.length - 1]! - time[0]!;
  const minDur = Math.min(...opt.durations);

  // Log-spaced periods; spacing keeps the last transit within about half a duration of the first.
  const step = Math.max(2e-4, minDur / (2 * baseline));
  const periods: number[] = [];
  for (let p = opt.minPeriod; p <= opt.maxPeriod; p *= 1 + step) periods.push(p);

  const tRef = time[0]!;
  const power = new Array<number>(periods.length);
  const bests: Best[] = new Array(periods.length);
  const maxBins = 1600;
  const sums = new Float64Array(maxBins);
  const counts = new Float64Array(maxBins);
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i]!;
    const nBins = Math.min(maxBins, Math.max(40, Math.ceil(p / (minDur / 2.5))));
    const b = scanPeriod(time, y, p, opt.durations, nBins, sums, counts, tRef);
    bests[i] = b;
    power[i] = b.power;
  }

  // Long periods catch more chance dips; divide out the slow rise of power with period.
  const smooth = movingMedian(power, Math.max(11, Math.round(periods.length / 12)));
  const norm = power.map((v, i) => (smooth[i]! > 0 ? v / smooth[i]! : 0));
  const sigmaN = robustSigma(norm) || 1;
  const medN = movingMedian(norm, norm.length)[0] ?? 0;

  // Rank by raw power (chi-squared improvement): it prefers the true period over its half.
  // The normalised curve is only used to judge how much the peak stands out (SDE).
  let bi = 0;
  for (let i = 1; i < power.length; i++) if (power[i]! > power[bi]!) bi = i;
  bi = resolveHarmonic(periods, bests, bi);
  const sde = (norm[bi]! - medN) / sigmaN;

  const sigmaFlux = robustSigma(y) || 1e-6;
  const toPeak = (i: number): BlsPeak => {
    const b = bests[i]!;
    const snr = (b.depth / sigmaFlux) * Math.sqrt(Math.max(1, b.nIn));
    return { period: periods[i]!, t0: b.t0, durationDays: b.dur, depth: b.depth, snr, power: norm[i]! };
  };

  // Distinct peaks: walk strongest-first and skip anything within 3 percent of an accepted period.
  const order = power.map((_, i) => i).sort((a, b) => power[b]! - power[a]!);
  const peaks: BlsPeak[] = [];
  for (const i of order) {
    if (peaks.length >= 5) break;
    if (peaks.every((pk) => Math.abs(pk.period - periods[i]!) / pk.period > 0.03)) peaks.push(toPeak(i));
  }
  return { periods, power: norm, best: toPeak(bi), peaks, sde };
}

/** If the best period is really half or a third of the true one, the longer period shows a deeper dip. */
function resolveHarmonic(periods: number[], bests: Best[], bi: number): number {
  let cur = bi;
  for (const k of [2, 3]) {
    const target = periods[bi]! * k;
    if (target > periods[periods.length - 1]!) continue;
    let j = 0;
    let dj = Infinity;
    for (let i = 0; i < periods.length; i++) {
      const d = Math.abs(periods[i]! - target);
      if (d < dj) { dj = d; j = i; }
    }
    // Search a small neighbourhood for the strongest box near the multiple.
    let jb = j;
    for (let i = Math.max(0, j - 40); i <= Math.min(periods.length - 1, j + 40); i++) {
      if (bests[i]!.power > bests[jb]!.power) jb = i;
    }
    if (bests[jb]!.depth > 0.75 * k * bests[bi]!.depth && bests[jb]!.power >= bests[bi]!.power) cur = jb;
  }
  return cur;
}

function movingMedian(values: number[], window: number): number[] {
  const n = values.length;
  const h = Math.floor(window / 2);
  const out = new Array<number>(n);
  const stride = Math.max(1, Math.floor(window / 40)); // subsample for speed; plenty for a trend
  for (let i = 0; i < n; i++) {
    const a: number[] = [];
    for (let j = Math.max(0, i - h); j <= Math.min(n - 1, i + h); j += stride) a.push(values[j]!);
    a.sort((x, y) => x - y);
    out[i] = a[Math.floor(a.length / 2)]!;
  }
  return out;
}

/** Refines period, epoch and duration around a coarse BLS peak using a finer grid. */
export function refinePeak(time: number[], flux: number[], peak: BlsPeak): BlsPeak {
  const m = mean(flux);
  const y = flux.map((v) => v - m);
  const sigmaFlux = robustSigma(y) || 1e-6;
  const sums = new Float64Array(3000);
  const counts = new Float64Array(3000);
  const durs = [0.6, 0.8, 1, 1.25, 1.5].map((f) => peak.durationDays * f);
  const tRef = time[0]!;
  const baseline = time[time.length - 1]! - tRef;
  // Search +/- one transit-length of drift over the whole baseline.
  const dP = peak.durationDays * (peak.period / baseline);
  let best: BlsPeak = peak;
  let bestRaw = -1;
  for (let k = -30; k <= 30; k++) {
    const p = peak.period + (k / 30) * dP;
    if (p <= 0) continue;
    const nBins = Math.min(3000, Math.max(80, Math.ceil(p / (Math.min(...durs) / 4))));
    const b = scanPeriod(time, y, p, durs, nBins, sums, counts, tRef);
    if (b.power > bestRaw) {
      bestRaw = b.power;
      const snr = (b.depth / sigmaFlux) * Math.sqrt(Math.max(1, b.nIn));
      best = { period: p, t0: b.t0, durationDays: b.dur, depth: b.depth, snr, power: peak.power };
    }
  }
  return best;
}
