export interface LightCurve {
  /** Days (any consistent zero point, e.g. BTJD). */
  time: number[];
  /** Brightness, normalised so the typical level is 1. */
  flux: number[];
}

export interface StarInfo {
  radiusSun: number;
  massSun: number;
  teffK: number;
}

export interface Target {
  id: string;
  name: string;
  kind: 'simulated' | 'real' | 'upload';
  /** e.g. "Simulated", "TESS sector 12", "Your file". */
  source: string;
  blurb: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'trap';
  star: StarInfo;
  curve: LightCurve;
  /** Only simulated targets know the answer. Hidden until the student reveals it. */
  truth?: { kind: 'planet' | 'eclipsing-binary' | 'none'; periodDays?: number; depthPpm?: number; note: string };
}

export interface DetrendParams {
  /** Smoothing window in days. Should be at least about 3x the transit length. */
  windowDays: number;
  /** Polynomial order of the Savitzky-Golay filter. */
  order: number;
  /** Remove upward spikes (flares) above this many sigma. */
  clipSigma: number;
}

export interface DetrendResult {
  time: number[];
  /** Flattened flux (trend divided out), upward outliers removed. */
  flux: number[];
  /** Trend for every ORIGINAL point, for drawing over the raw curve. */
  trend: number[];
  removed: number;
  /** Robust scatter of the flattened flux (1.4826 * MAD). */
  sigma: number;
}

export interface BlsOptions {
  minPeriod: number;
  maxPeriod: number;
  /** Candidate transit durations in days. */
  durations: number[];
}

export interface BlsPeak {
  period: number;
  t0: number;
  durationDays: number;
  depth: number;
  snr: number;
  power: number;
}

export interface BlsResult {
  periods: number[];
  power: number[];
  best: BlsPeak;
  /** Distinct peaks, strongest first (neighbouring periods merged). */
  peaks: BlsPeak[];
  /** Signal detection efficiency: how far the best peak stands above the noise floor. */
  sde: number;
}
