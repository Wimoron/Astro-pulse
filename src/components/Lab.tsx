'use client';
/* eslint-disable react-hooks/set-state-in-effect -- the orbit search starts itself when the student reaches that step */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bls as runBls, refinePeak } from '@/lib/bls';
import { detrend } from '@/lib/detrend';
import { binFolded, fold, measureTransit, oddEven, planetPhysics, secondaryEclipse } from '@/lib/physics';
import { robustSigma } from '@/lib/stats';
import type { BlsPeak, BlsResult, DetrendParams, StarInfo, Target } from '@/lib/types';
import { Plot } from './Plot';
import { DiscoveryCard } from './DiscoveryCard';
import { recordDiscovery } from '@/lib/progress';

export type Mode = 'beginner' | 'expert';
export interface LabState {
  w: number;
  o: number;
  c: number;
  p: number;
  s: number;
}

const STEPS = ['Look at the light', 'Clean the data', 'Find the orbit time', 'Stack and measure', 'Verdict'];
const JOBS = [
  'Look at the graph. Can you see the wobble and the spikes? A planet is hiding underneath.',
  'Remove the slow wobble so only quick dips are left.',
  'Let the computer try thousands of orbit times and pick the best guess.',
  'Stack all the dips on top of each other and measure the planet.',
  'Run the same checks astronomers use. Planet, or impostor?',
];
const DURATIONS = [0.04, 0.06, 0.09, 0.13, 0.18];
const BALANCED: DetrendParams = { windowDays: 1.0, order: 2, clipSigma: 4 };
const PRESETS: Array<{ id: string; label: string; desc: string; p: DetrendParams }> = [
  { id: 'gentle', label: 'Gentle', desc: 'Leaves some wobble. Safest for tiny planets.', p: { windowDays: 2.5, order: 1, clipSigma: 5 } },
  { id: 'balanced', label: 'Balanced', desc: 'Works well for most stars. Start here.', p: BALANCED },
  { id: 'strong', label: 'Strong', desc: 'Removes more wobble, but can erase a real planet.', p: { windowDays: 0.4, order: 3, clipSigma: 3 } },
];
const SUN: StarInfo = { radiusSun: 1, massSun: 1, teffK: 5772 };

const WORDS: Record<string, string> = {
  'Light curve': 'A graph of a star’s brightness over time. Each dot is one measurement.',
  Flare: 'A sudden burst of extra light from the star’s surface. It shows up as a sharp upward spike.',
  Starspot: 'A dark patch on a star, like a sunspot. As the star spins, spots rotate in and out of view and cause a slow wobble.',
  Transit: 'When a planet passes in front of its star and blocks a little of its light. The graph dips, then recovers.',
  Trend: 'The slow, smooth change in brightness. We draw it so we can remove it.',
  Noise: 'Random jitter in every measurement. It never fully goes away, so small planets are hard to see.',
  ppm: 'Parts per million. 10,000 ppm is 1%. A big planet blocks about 10,000 ppm. An Earth blocks about 100.',
  'Orbit time': 'How long the planet takes to go once around its star. Astronomers call it the period.',
  Echo: 'A fake peak at half or double the real orbit time. It appears because a repeating pattern also repeats at multiples.',
  Fold: 'Cut the graph into pieces, one per orbit, and stack them. Real dips pile up. Noise cancels out.',
  Depth: 'How much the star dims during the transit. Deeper means a bigger planet.',
  'Signal-to-noise': 'How loud the dip is compared with the random jitter. Above about 7 is trustworthy.',
  'Eclipsing binary': 'Two stars orbiting each other and blocking each other’s light. It can look just like a planet.',
  'Habitable zone': 'The distance range where a planet could have liquid water. It does not mean anything lives there.',
};
const STEP_WORDS: string[][] = [
  ['Light curve', 'Starspot', 'Flare', 'Transit'],
  ['Trend', 'Noise', 'ppm', 'Flare'],
  ['Orbit time', 'Echo', 'Signal-to-noise'],
  ['Fold', 'Depth', 'Transit', 'Signal-to-noise'],
  ['Eclipsing binary', 'Habitable zone', 'Depth'],
];

const ppm = (v: number) => `${Math.round(v * 1e6).toLocaleString()} ppm`;
const num = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');

function download(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-white/10 bg-[#0a0a0d] p-4 ${className}`}>{children}</section>;
}

function Btn({ children, onClick, primary, disabled, className = '' }: { children: React.ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-12 rounded-full px-5 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
        primary ? 'pill-primary' : 'pill text-white'
      } ${className}`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass rounded-xl p-3">
      <div className="text-xs font-semibold text-[#9fb0cf]">{label}</div>
      <div className="mt-0.5 text-xl font-semibold text-white">{value}</div>
      {sub ? <div className="text-xs text-[#9fb0cf]">{sub}</div> : null}
    </div>
  );
}

function Words({ items }: { items: string[] }) {
  return (
    <details className="glass rounded-xl p-3 text-sm">
      <summary className="cursor-pointer select-none font-semibold text-white">New words on this page</summary>
      <dl className="mt-3 space-y-3">
        {items.map((w) => (
          <div key={w}>
            <dt className="font-semibold text-white">{w}</dt>
            <dd className="text-[#c5d1ea]">{WORDS[w]}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function Slider(p: { label: string; value: number; min: number; max: number; step: number; unit?: string; hint: string; expert: boolean; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2 text-sm font-semibold text-white">
        <span>{p.label}</span>
        {p.expert ? (
          <input
            type="number"
            value={p.value}
            min={p.min}
            max={p.max}
            step={p.step}
            onChange={(e) => p.onChange(Number(e.target.value))}
            className="w-24 rounded border border-white/25 bg-[#0a0a0d] px-2 py-1 text-right font-mono text-white"
          />
        ) : (
          <span className="font-mono text-white">
            {p.value}
            {p.unit ?? ''}
          </span>
        )}
      </span>
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value} onChange={(e) => p.onChange(Number(e.target.value))} className="mt-1" />
      <span className="block text-xs text-[#9fb0cf]">{p.hint}</span>
    </label>
  );
}

function sizeWords(rEarth: number): string {
  if (rEarth < 1.25) return 'about Earth-sized, probably rocky';
  if (rEarth < 2) return 'a super-Earth, larger than Earth and probably rocky';
  if (rEarth < 6) return 'a mini-Neptune, a small planet with a thick gas layer';
  if (rEarth < 24.6) return 'a gas giant, similar to Jupiter or Saturn';
  return 'huge, bigger than any known planet. It is probably a star';
}

interface Props {
  target: Target;
  mode: Mode;
  initial: Partial<LabState>;
  onState: (s: LabState) => void;
  onBack: () => void;
  onShare: () => void;
  copied: boolean;
}

export function Lab({ target, mode, initial, onState, onBack, onShare, copied }: Props) {
  const expert = mode === 'expert';
  const [step, setStep] = useState(Math.min(4, Math.max(0, initial.s ?? 0)));
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [step]);
  const [dp, setDp] = useState<DetrendParams>({
    windowDays: initial.w ?? BALANCED.windowDays,
    order: initial.o ?? BALANCED.order,
    clipSigma: initial.c ?? BALANCED.clipSigma,
  });
  const [sel, setSel] = useState(initial.p ?? 0);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [manual, setManual] = useState<{ period: number; t0: number; dur: number } | null>(null);
  const [starOv, setStarOv] = useState<StarInfo | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [search, setSearch] = useState<{ key: string; result: BlsResult; peaks: BlsPeak[] } | null>(null);
  const [running, setRunning] = useState(false);

  const star = starOv ?? target.star ?? SUN;
  const curve = target.curve;
  const t0Abs = curve.time[0] ?? 0;
  const baseline = curve.time.length ? curve.time[curve.time.length - 1]! - t0Abs : 0;

  useEffect(() => {
    onState({ w: dp.windowDays, o: dp.order, c: dp.clipSigma, p: sel, s: step });
  }, [dp, sel, step, onState]);

  const det = useMemo(() => detrend(curve, dp), [curve, dp]);
  const noise = useMemo(() => robustSigma(det.flux), [det]);

  const defaultRange: [number, number] = [0.5, Math.max(2, Math.min(30, baseline / 1.4))];
  const pr = range ?? defaultRange;
  const key = `${target.id}|${dp.windowDays}|${dp.order}|${dp.clipSigma}|${pr[0]}|${pr[1]}|${curve.time.length}`;

  const doSearch = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      try {
        const r = runBls(det.time, det.flux, { minPeriod: pr[0], maxPeriod: pr[1], durations: DURATIONS });
        const peaks = r.peaks.map((p) => refinePeak(det.time, det.flux, p));
        setSearch({ key, result: r, peaks });
      } finally {
        setRunning(false);
      }
    }, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [det, key]);

  useEffect(() => {
    if (step >= 2 && (!search || search.key !== key) && !running) doSearch();
  }, [step, search, key, running, doSearch]);

  const peaks = useMemo(() => (search && search.key === key ? search.peaks : []), [search, key]);
  const cand = useMemo(
    () =>
      manual
        ? { period: manual.period, t0: manual.t0, durationDays: manual.dur }
        : (peaks[Math.min(sel, Math.max(0, peaks.length - 1))] ?? null),
    [manual, peaks, sel],
  );

  const analysis = useMemo(() => {
    if (!cand || !(cand.period > 0)) return null;
    const m = measureTransit(det.time, det.flux, cand.period, cand.t0, cand.durationDays);
    const phys = planetPhysics(star, cand.period, Math.max(0, m.depth));
    const oe = oddEven(det.time, det.flux, cand.period, cand.t0, cand.durationDays);
    const sec = secondaryEclipse(det.time, det.flux, cand.period, cand.t0, cand.durationDays);
    return { m, phys, oe, sec };
  }, [det, cand, star]);

  const rawX = useMemo(() => curve.time.map((t) => t - t0Abs), [curve.time, t0Abs]);
  const detX = useMemo(() => det.time.map((t) => t - t0Abs), [det, t0Abs]);

  const foldView = useMemo(() => {
    if (!cand || !analysis) return null;
    const half = Math.min(cand.period / 2, Math.max(0.35, cand.durationDays * 3));
    const mk = (t0: number) => {
      const pts = fold(det.time, det.flux, cand.period, t0).filter((p) => Math.abs(p.dt) <= half);
      const bins = binFolded(pts, Math.max(cand.durationDays / 8, 0.004), half);
      return { x: pts.map((p) => p.dt * 24), y: pts.map((p) => p.flux), bx: bins.map((p) => p.dt * 24), by: bins.map((p) => p.flux) };
    };
    const depth = Math.max(analysis.m.depth, noise * 2);
    const yr: [number, number] = [1 - depth * 1.7 - noise * 3, 1 + noise * 4];
    return { main: mk(cand.t0), opp: mk(cand.t0 + cand.period / 2), yr };
  }, [det, cand, analysis, noise]);

  const checks = useMemo(() => {
    if (!analysis || !cand) return [];
    const { m, phys, oe, sec } = analysis;
    const out: Array<{ ok: boolean | null; title: string; detail: string }> = [];
    out.push({ ok: m.nTransits >= 2, title: 'Seen at least twice', detail: `The dip appears ${m.nTransits} time${m.nTransits === 1 ? '' : 's'} in the data. One dip alone could be anything.` });
    out.push({ ok: m.snr >= 7, title: 'Strong enough to trust', detail: `Signal-to-noise is ${num(m.snr, 1)}. Below about 7 it is easy to fool yourself.` });
    out.push({
      ok: oe ? oe.sigma < 3 : null,
      title: 'Every dip looks the same',
      detail: oe ? `Odd dips ${ppm(oe.odd)}, even dips ${ppm(oe.even)}. Two eclipsing stars often give unequal dips.` : 'Not enough data to compare.',
    });
    out.push({
      ok: sec ? sec.sigma < 4 : null,
      title: 'Nothing happens half an orbit later',
      detail: sec ? `Brightness change at the opposite side: ${ppm(Math.max(0, sec.depth))}. A real dip there means a second glowing star.` : 'Not enough data to check.',
    });
    out.push({ ok: phys.radiusJupiter < 2.2, title: 'Small enough to be a planet', detail: `It works out to ${num(phys.radiusJupiter, 2)} times Jupiter’s width. Over about 2 means it is a star.` });
    const ratio = cand.durationDays / phys.expectedDurationDays;
    out.push({
      ok: ratio > 0.25 && ratio < 1.8,
      title: 'Dip length fits the orbit',
      detail: `Measured ${num(cand.durationDays * 24, 1)} hours. For this star and orbit, up to ${num(phys.expectedDurationDays * 24, 1)} hours is expected.`,
    });
    return out;
  }, [analysis, cand]);

  const failedOther = checks.filter((c) => c.ok === false && c.title !== 'Strong enough to trust').length;
  const weak = checks.some((c) => c.ok === false && c.title === 'Strong enough to trust');
  const verdict = !analysis
    ? null
    : analysis.m.snr < 5
      ? { tone: 'warn', head: 'No convincing signal', text: 'The dip is too weak to trust. Saying “I can’t tell” is a real scientific result.' }
      : failedOther > 0
        ? { tone: 'bad', head: 'Probably not a planet', text: `It fails ${failedOther} check${failedOther > 1 ? 's' : ''}. This looks like something else, maybe two stars eclipsing.` }
        : weak
          ? { tone: 'warn', head: 'A tentative candidate', text: 'It passes the shape checks, but the signal is weak. More data would settle it.' }
          : { tone: 'good', head: 'Looks like a planet', text: 'It passes every check here. Astronomers would call this a planet candidate.' };
  const disc = useMemo(() => {
    if (!analysis || !cand || verdict?.tone !== 'good' || target.kind === 'upload') return null;
    const ph = analysis.phys;
    return {
      id: `transit-${target.id}`,
      name: target.name,
      method: 'transit' as const,
      facts: [
        ['Size', `${num(ph.radiusEarth, 1)} R⊕`],
        ['Year', `${num(cand.period, 2)} d`],
        ['Orbit', `${num(ph.semiMajorAU, 3)} AU`],
        ['Temp', `${Math.round(ph.equilibriumK - 273)} °C`],
      ] as Array<[string, string]>,
    };
  }, [analysis, cand, verdict?.tone, target.id, target.name, target.kind]);
  useEffect(() => {
    if (step === 4 && disc) recordDiscovery(disc);
  }, [step, disc]);

  const activePreset = PRESETS.find((p) => p.p.windowDays === dp.windowDays && p.p.order === dp.order && p.p.clipSigma === dp.clipSigma)?.id ?? 'custom';
  const tooStrong = dp.windowDays < 0.35;

  const exportResults = () => {
    if (!analysis || !cand) return;
    download(`${target.id}-result.json`, JSON.stringify({ target: target.name, detrend: dp, candidate: cand, measurement: analysis.m, physics: analysis.phys, oddEven: analysis.oe, secondary: analysis.sec, checks }, null, 2));
  };
  const exportCurve = () => {
    const rows = ['time,flux'];
    for (let i = 0; i < det.time.length; i++) rows.push(`${det.time[i]},${det.flux[i]}`);
    download(`${target.id}-cleaned.csv`, rows.join('\n'), 'text/csv');
  };

  const searching = running || !search || search.key !== key;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto">
      {/* Step header */}
      <div className="border-b border-white/10 bg-[#050506] px-3 py-3 md:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <button type="button" onClick={onBack} className="min-h-10 pill px-3 text-sm font-medium text-white">
                ← Telescope
              </button>
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-[#9fb0cf]">
                  {target.name} · Step {step + 1} of 5
                </div>
                <h2 className="text-xl font-semibold text-white md:text-2xl">{STEPS[step]}</h2>
              </div>
            </div>
            <div className="flex gap-1.5" role="group" aria-label="Lab steps">
              {STEPS.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStep(i)}
                  aria-label={`Go to ${s}`}
                  aria-current={i === step ? 'step' : undefined}
                  className={`h-9 min-w-9 rounded-full px-2 text-sm font-semibold ${i === step ? 'bg-white text-[#050506]' : i < step ? 'bg-white/20 text-white' : 'bg-white/5 text-[#b3c0da]'}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 glass rounded-xl px-3 py-2 text-base text-white">
            <b className="text-white">Your job: </b>
            {JOBS[step]}
          </p>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-7xl gap-4 p-3 md:p-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* LEFT: graphs */}
        <div className="min-w-0 space-y-4">
          {step === 0 && (
            <>
              <Panel>
                <h3 className="mb-1 text-sm font-semibold text-[#c5d1ea]">Brightness of {target.name} over {num(baseline, 0)} days</h3>
                <Plot ariaLabel="Raw brightness of the star over time" series={[{ x: rawX, y: curve.flux, color: '#cbd6ef' }]} xLabel="Days since start" yLabel="Brightness (1 = normal)" height={300} />
              </Panel>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Measurements" value={curve.time.length.toLocaleString()} />
                <Stat label="Watched for" value={`${num(baseline, 1)} days`} />
                <Stat label="Star size" value={`${num(star.radiusSun, 2)} Suns`} sub="across, compared with ours" />
                <Stat label="Star surface" value={`${Math.round(star.teffK).toLocaleString()} K`} sub={star.teffK < 4000 ? 'cool red star' : star.teffK > 6000 ? 'hot white-yellow star' : 'yellow star like the Sun'} />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <Panel className="space-y-1">
                <h3 className="text-sm font-semibold text-[#c5d1ea]">Before: the raw starlight, with the wobble the computer found (blue line)</h3>
                <Plot
                  ariaLabel="Raw brightness with the fitted slow trend"
                  series={[
                    { x: rawX, y: curve.flux, color: '#8a98b8' },
                    { x: rawX, y: det.trend, color: '#67e8f9', kind: 'line' },
                  ]}
                  xLabel="Days since start"
                  yLabel="Brightness"
                  height={230}
                />
              </Panel>
              <Panel className="space-y-1">
                <h3 className="text-sm font-semibold text-[#c5d1ea]">After: the wobble removed. Look for small repeating dips.</h3>
                <Plot ariaLabel="Brightness after the trend is removed" series={[{ x: detX, y: det.flux, color: '#ffffff' }]} xLabel="Days since start" yLabel="Brightness" height={230} />
              </Panel>
            </>
          )}

          {step === 2 && (
            <Panel>
              <h3 className="mb-1 text-sm font-semibold text-[#c5d1ea]">How strongly each orbit time matches the dips. Tall peaks = something repeats.</h3>
              {searching || !search ? (
                <div className="flex h-[280px] items-center justify-center text-base text-[#c5d1ea]" role="status">
                  Trying thousands of orbit times…
                </div>
              ) : (
                <Plot
                  ariaLabel="Search result: how well each orbit time matches the data"
                  series={[{ x: search.result.periods, y: search.result.power, color: '#67e8f9', kind: 'line' }]}
                  vlines={peaks.map((p, i) => ({ x: p.period, color: i === sel ? '#fbbf24' : '#64748b', dash: i !== sel, label: i === sel ? `${num(p.period, 2)} days` : undefined }))}
                  xLabel="Orbit time tried (days)"
                  yLabel="Match strength"
                  height={280}
                />
              )}
            </Panel>
          )}

          {step === 3 && foldView && cand && analysis && (
            <>
              <Panel className="space-y-1">
                <h3 className="text-sm font-semibold text-[#c5d1ea]">All the dips stacked together (orbit time {num(cand.period, 3)} days). The orange line is the average.</h3>
                <Plot
                  ariaLabel="Folded brightness around the transit"
                  series={[
                    { x: foldView.main.x, y: foldView.main.y, color: '#8a98b8' },
                    { x: foldView.main.bx, y: foldView.main.by, color: '#fbbf24', kind: 'line' },
                  ]}
                  vlines={[{ x: 0, color: '#475569', dash: true }]}
                  xLabel="Hours from the middle of the dip"
                  yLabel="Brightness"
                  yRange={foldView.yr}
                  height={260}
                />
              </Panel>
              <Panel className="space-y-1">
                <h3 className="text-sm font-semibold text-[#c5d1ea]">Same stacking, but half an orbit later. A planet is dark, so this should be flat.</h3>
                <Plot
                  ariaLabel="Folded brightness half an orbit away from the transit"
                  series={[
                    { x: foldView.opp.x, y: foldView.opp.y, color: '#8a98b8' },
                    { x: foldView.opp.bx, y: foldView.opp.by, color: '#67e8f9', kind: 'line' },
                  ]}
                  xLabel="Hours from half an orbit"
                  yLabel="Brightness"
                  yRange={foldView.yr}
                  height={190}
                />
              </Panel>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="How deep" value={`${num(analysis.m.depth * 100, 2)}%`} sub={`${ppm(analysis.m.depth)} of the light`} />
                <Stat label="How long" value={`${num(cand.durationDays * 24, 1)} hours`} />
                <Stat label="Dips seen" value={String(analysis.m.nTransits)} />
                <Stat label="Confidence" value={analysis.m.snr >= 10 ? 'Strong' : analysis.m.snr >= 7 ? 'Good' : analysis.m.snr >= 5 ? 'Weak' : 'Very weak'} sub={`signal-to-noise ${num(analysis.m.snr, 1)}`} />
              </div>
            </>
          )}

          {step === 4 && verdict && analysis && cand && (
            <>
              <section className={`rounded-xl border-2 p-5 ${verdict.tone === 'good' ? 'border-[#4ade80] bg-[#0d2418]' : verdict.tone === 'bad' ? 'border-[#f87171] bg-[#2a1313]' : 'border-[#fbbf24] bg-[#2a2210]'}`}>
                <div className="text-xs font-semibold uppercase tracking-widest text-[#c5d1ea]">Your verdict</div>
                <h3 className="mt-1 text-3xl font-semibold text-white" role="status">
                  {verdict.head}
                </h3>
                <p className="mt-1 text-base text-[#e6edff]">{verdict.text}</p>
              </section>
              <Panel>
                <h3 className="mb-3 text-lg font-semibold text-white">The checklist</h3>
                <ul className="space-y-3">
                  {checks.map((c) => (
                    <li key={c.title} className="flex gap-3">
                      <span
                        aria-label={c.ok === null ? 'unknown' : c.ok ? 'pass' : 'fail'}
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-[#04110a] ${c.ok === null ? 'bg-[#9fb0cf]' : c.ok ? 'bg-[#4ade80]' : 'bg-[#f87171]'}`}
                      >
                        {c.ok === null ? '?' : c.ok ? '✓' : '✗'}
                      </span>
                      <div>
                        <div className="text-base font-semibold text-white">{c.title}</div>
                        <div className="text-sm text-[#c5d1ea]">{c.detail}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
            </>
          )}
        </div>

        {/* RIGHT: guide + controls */}
        <aside className="space-y-4">
          {step === 0 && (
            <Panel className="space-y-3 text-base text-[#e6edff]">
              <h3 className="text-lg font-semibold text-white">What you are looking at</h3>
              <ul className="list-disc space-y-2 pl-5 text-[#d5def5]">
                <li>Each dot is one measurement of the star’s brightness. 1.00 means normal.</li>
                <li>The slow up-and-down wobble is dark <b>starspots</b> rotating in and out of view.</li>
                <li>The sharp upward spikes are <b>flares</b>, bursts of extra light.</li>
                <li>A planet crossing the star makes a small, quick <b>dip</b>. It is hidden under the wobble.</li>
              </ul>
              <p className="text-sm text-[#9fb0cf]">Next, we clean the wobble away.</p>
            </Panel>
          )}

          {step === 1 && (
            <Panel className="space-y-4">
              <h3 className="text-lg font-semibold text-white">How much cleaning?</h3>
              {!expert && (
                <>
                  <div className="grid gap-2" role="radiogroup" aria-label="Cleaning strength">
                    {PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={activePreset === p.id}
                        onClick={() => setDp(p.p)}
                        className={`rounded-xl border-2 p-3 text-left ${activePreset === p.id ? 'border-white bg-white/10' : 'border-white/15 bg-white/[0.04]'}`}
                      >
                        <div className="text-base font-semibold text-white">{p.label}</div>
                        <div className="text-sm text-[#c5d1ea]">{p.desc}</div>
                      </button>
                    ))}
                  </div>
                  {tooStrong ? <p className="rounded-lg border border-[#f87171] bg-[#2a1313] p-3 text-sm text-[#fecaca]" role="alert">Careful: this cleaning is so strong it may erase a real planet’s dip along with the wobble.</p> : null}
                </>
              )}
              <details className="glass rounded-xl p-3" open={expert}>
                <summary className="cursor-pointer select-none text-sm font-semibold text-white">{expert ? 'Filter settings' : 'Fine-tune it yourself (optional)'}</summary>
                <div className="mt-3 space-y-4">
                  <Slider expert={expert} label={expert ? 'Smoothing window (days)' : 'How long a stretch to smooth'} unit=" days" min={0.2} max={3} step={0.05} value={dp.windowDays} hint="Longer is safer for planets. Too short and the filter eats the dip." onChange={(v) => setDp({ ...dp, windowDays: v })} />
                  <Slider expert={expert} label={expert ? 'Polynomial order' : 'How bendy the smooth line can be'} min={1} max={4} step={1} value={dp.order} hint="1 is nearly straight. 4 can follow small wiggles, even a planet’s dip." onChange={(v) => setDp({ ...dp, order: v })} />
                  <Slider expert={expert} label={expert ? 'Flare clip (sigma)' : 'How aggressively to remove flares'} unit="" min={2} max={8} step={0.5} value={dp.clipSigma} hint="Lower removes more upward spikes. Higher keeps more." onChange={(v) => setDp({ ...dp, clipSigma: v })} />
                  <Btn onClick={() => setDp(BALANCED)}>Reset to Balanced</Btn>
                </div>
              </details>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Flare points removed" value={String(det.removed)} />
                <Stat label="Jitter left" value={ppm(noise)} sub="in each measurement" />
              </div>
              {expert && <Btn onClick={exportCurve}>Download cleaned data (CSV)</Btn>}
              <Words items={STEP_WORDS[1]!} />
            </Panel>
          )}

          {step === 2 && (
            <Panel className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Best guesses for the orbit time</h3>
              <p className="text-sm text-[#d5def5]">Tap one to try it. The first is usually best. A guess marked “echo” is probably the same signal at half or double the real time.</p>
              {searching ? (
                <p className="text-base text-[#c5d1ea]">Searching…</p>
              ) : (
                <div className="space-y-2" role="radiogroup" aria-label="Orbit time guesses">
                  {peaks.map((p, i) => {
                    const r = p.period / peaks[0]!.period;
                    const echo = i > 0 && [0.5, 2, 3, 1 / 3].some((h) => Math.abs(r - h) < 0.03);
                    const conf = p.snr >= 10 ? 'Strong' : p.snr >= 7 ? 'Good' : p.snr >= 5 ? 'Weak' : 'Very weak';
                    return (
                      <button
                        key={i}
                        type="button"
                        role="radio"
                        aria-checked={i === sel && !manual}
                        onClick={() => {
                          setSel(i);
                          setManual(null);
                        }}
                        className={`w-full rounded-xl border-2 p-3 text-left ${i === sel && !manual ? 'border-[#fbbf24] bg-[#2a2210]' : 'border-white/15 bg-white/[0.04]'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-lg font-semibold text-white">Every {num(p.period, 3)} days</span>
                          <span className="text-sm font-semibold text-[#fde68a]">{i === 0 ? 'Best guess' : echo ? 'Echo' : `Guess ${i + 1}`}</span>
                        </div>
                        <div className="text-sm text-[#c5d1ea]">
                          Dips {num(p.depth * 100, 2)}% deep · {echo ? 'probably an echo of the best guess' : `confidence: ${conf}`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {search && !searching ? <p className="text-xs text-[#9fb0cf]">The best peak stands out {num(search.result.sde, 1)} times above the background.</p> : null}
              {expert && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm font-semibold text-white">
                    Shortest (days)
                    <input type="number" step="0.1" value={pr[0]} onChange={(e) => setRange([Math.max(0.2, Number(e.target.value)), pr[1]])} className="mt-1 w-full rounded border border-white/25 bg-[#0a0a0d] px-2 py-2 font-mono" />
                  </label>
                  <label className="text-sm font-semibold text-white">
                    Longest (days)
                    <input type="number" step="1" value={pr[1]} onChange={(e) => setRange([pr[0], Math.max(pr[0] + 0.5, Number(e.target.value))])} className="mt-1 w-full rounded border border-white/25 bg-[#0a0a0d] px-2 py-2 font-mono" />
                  </label>
                </div>
              )}
              <Words items={STEP_WORDS[2]!} />
            </Panel>
          )}

          {step === 3 && (
            <Panel className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Why stack the dips?</h3>
              <p className="text-base text-[#d5def5]">One dip is buried in noise. Stacking every orbit on top of each other makes the real dip stand out and the noise cancel. If the dip looks sharp and tidy, the orbit time is right. If it looks smeared, it is slightly off.</p>
              {expert && cand && (
                <div className="grid gap-3">
                  {(
                    [
                      ['Orbit time (days)', 'period', 0.0001],
                      ['Middle of a dip (day)', 't0', 0.001],
                      ['Dip length (days)', 'dur', 0.005],
                    ] as const
                  ).map(([label, k, st]) => {
                    const base = manual ?? { period: cand.period, t0: cand.t0, dur: cand.durationDays };
                    return (
                      <label key={k} className="text-sm font-semibold text-white">
                        {label}
                        <input type="number" step={st} value={Number(base[k].toFixed(5))} onChange={(e) => setManual({ ...base, [k]: Number(e.target.value) })} className="mt-1 w-full rounded border border-white/25 bg-[#0a0a0d] px-2 py-2 font-mono" />
                      </label>
                    );
                  })}
                  <Btn onClick={() => setManual(null)} disabled={!manual}>Back to the search result</Btn>
                </div>
              )}
              <Words items={STEP_WORDS[3]!} />
            </Panel>
          )}

          {step === 4 && analysis && cand && (
            <>
              {disc ? <DiscoveryCard d={disc} onNext={onBack} nextLabel="Try another star" /> : null}
              <Panel className="space-y-3">
                <h3 className="text-lg font-semibold text-white">If it is a planet</h3>
                <ul className="space-y-2 text-base text-[#e6edff]">
                  <li>
                    <b>Size:</b> {num(analysis.phys.radiusEarth, 1)} times Earth’s width ({num(analysis.phys.radiusJupiter, 2)} Jupiters), {sizeWords(analysis.phys.radiusEarth)}.
                  </li>
                  <li>
                    <b>Year length:</b> {num(cand.period, 2)} days.
                  </li>
                  <li>
                    <b>Distance from its star:</b> {num(analysis.phys.semiMajorAU, 3)} AU{analysis.phys.semiMajorAU < 0.387 ? ', closer than Mercury is to our Sun' : ''}.
                  </li>
                  <li>
                    <b>Temperature:</b> about {Math.round(analysis.phys.equilibriumK - 273)} °C ({Math.round(analysis.phys.equilibriumK)} K).
                  </li>
                  <li>
                    <b>Habitable zone:</b> {analysis.phys.inHabitableZone ? 'inside, where liquid water could exist' : 'outside, too hot or too cold for liquid water'}.
                  </li>
                </ul>
                {target.kind === 'upload' && (
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ['Star width (Suns)', 'radiusSun'],
                        ['Star weight (Suns)', 'massSun'],
                        ['Star heat (K)', 'teffK'],
                      ] as const
                    ).map(([l, k]) => (
                      <label key={k} className="text-xs font-semibold text-white">
                        {l}
                        <input type="number" step="any" value={star[k]} onChange={(e) => setStarOv({ ...star, [k]: Number(e.target.value) || star[k] })} className="mt-1 w-full rounded border border-white/25 bg-[#0a0a0d] px-2 py-2 font-mono" />
                      </label>
                    ))}
                  </div>
                )}
              </Panel>

              {target.truth ? (
                <Panel className="space-y-2">
                  {!revealed ? (
                    <>
                      <h3 className="text-lg font-semibold text-white">Ready for the answer?</h3>
                      <Btn primary onClick={() => setRevealed(true)}>Reveal what astronomers know</Btn>
                    </>
                  ) : (
                    <>
                      <h3 className="text-lg font-semibold text-white">The answer</h3>
                      <p className="text-base text-[#e6edff]">{target.truth.note}</p>
                      {target.truth.periodDays ? (
                        <p className="text-sm text-[#c5d1ea]">
                          Known orbit time: {num(target.truth.periodDays, 4)} days. You found {num(cand.period, 4)} days ({num((Math.abs(cand.period - target.truth.periodDays) / target.truth.periodDays) * 100, 1)}% off).
                        </p>
                      ) : null}
                    </>
                  )}
                </Panel>
              ) : null}

              <Panel className="space-y-2">
                <h3 className="text-lg font-semibold text-white">Keep going</h3>
                <div className="flex flex-wrap gap-2">
                  <Btn onClick={onShare}>{copied ? 'Link copied' : 'Share this analysis'}</Btn>
                  <Btn onClick={onBack}>Try another star</Btn>
                  {expert && <Btn onClick={exportResults}>Download results</Btn>}
                  {expert && <Btn onClick={exportCurve}>Download cleaned data</Btn>}
                </div>
                {target.kind === 'upload' ? <p className="text-xs text-[#9fb0cf]">Share links cannot carry an uploaded file.</p> : null}
              </Panel>
              <Words items={STEP_WORDS[4]!} />
            </>
          )}
        </aside>
      </div>
      </div>

      {/* Navigation */}
      <div className="shrink-0 z-20 border-t border-white/10 bg-[#050506]/97 px-3 py-3 md:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <Btn onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            ← Back
          </Btn>
          <span className="hidden text-sm text-[#9fb0cf] sm:block">{step < 4 ? `Next: ${STEPS[step + 1]}` : 'You finished the hunt'}</span>
          <Btn primary onClick={() => setStep((s) => Math.min(4, s + 1))} disabled={step === 4}>
            {step === 3 ? 'See the verdict →' : 'Next →'}
          </Btn>
        </div>
      </div>
    </div>
  );
}
