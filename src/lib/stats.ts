export function median(values: ArrayLike<number>): number {
  const n = values.length;
  if (n === 0) return NaN;
  const a = Array.from(values).sort((x, y) => x - y);
  return n % 2 ? a[(n - 1) / 2]! : (a[n / 2 - 1]! + a[n / 2]!) / 2;
}

export function mean(values: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < values.length; i++) s += values[i]!;
  return values.length ? s / values.length : NaN;
}

/** Robust standard deviation from the median absolute deviation. */
export function robustSigma(values: ArrayLike<number>): number {
  const m = median(values);
  const dev = Array.from(values, (v) => Math.abs(v - m));
  return 1.4826 * median(dev);
}

export function percentile(values: ArrayLike<number>, p: number): number {
  const a = Array.from(values).sort((x, y) => x - y);
  if (a.length === 0) return NaN;
  const idx = Math.min(a.length - 1, Math.max(0, Math.round((p / 100) * (a.length - 1))));
  return a[idx]!;
}
