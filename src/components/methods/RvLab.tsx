'use client';

import { useMemo, useState } from 'react';
import type { SkyTarget } from '@/lib/catalog';
import { EARTH_PER_MJ, fitSine, logSpace, massFromK, simulateRv } from '@/lib/methods';
import { Plot } from '../Plot';
import { planetFacts } from '@/lib/progress';
import { BTN2, Callout, Diagram, hash, MatchCurve, Meter, PANEL, Shell, Slider, Words, type StepDef } from './ui';

export function massWords(mj: number): string {
  const e = mj * EARTH_PER_MJ;
  if (mj >= 13) return 'heavier than a planet: probably a brown dwarf';
  if (mj >= 0.3) return 'a gas giant, like Jupiter';
  if (e >= 10) return 'a Neptune-sized world';
  if (e >= 2) return 'a super-Earth, heavier than Earth but rocky or icy';
  return 'about as heavy as Earth: a small rocky world';
}
export function fmtMass(mj: number): string {
  return mj >= 0.1 ? `${mj.toFixed(2)} Jupiters` : `${(mj * EARTH_PER_MJ).toFixed(1)} Earths`;
}

export function RvLab({ target, onBack, picker }: { target: SkyTarget; onBack: () => void; picker: React.ReactNode }) {
  const pl = target.planet!;
  const data = useMemo(() => simulateRv({ seed: hash(target.id), period: pl.periodDays!, mjup: pl.massJup!, starMass: pl.starMass }), [target.id, pl]);
  const grid = useMemo(() => logSpace(0.6, Math.max(5, data.baseline / 1.5), 500), [data.baseline]);
  const curve = useMemo(() => grid.map((p) => fitSine(data.t, data.v, p).r2), [grid, data]);
  const best = useMemo(() => {
    let k = 0;
    curve.forEach((v, i) => { if (v > curve[k]!) k = i; });
    // Refine around the best grid point.
    const fine = logSpace(grid[Math.max(0, k - 1)]!, grid[Math.min(grid.length - 1, k + 1)]!, 120);
    let bp = grid[k]!, br = -1;
    for (const p of fine) { const r = fitSine(data.t, data.v, p).r2; if (r > br) { br = r; bp = p; } }
    return { p: bp, r2: br };
  }, [curve, grid, data]);

  const lo = Math.log10(grid[0]!), hi = Math.log10(grid[grid.length - 1]!);
  const [pos, setPos] = useState(() => 0.5 + (hash(target.id) % 20) / 100); // slider 0..1 on a log scale
  const trial = Math.pow(10, lo + pos * (hi - lo));
  const fit = fitSine(data.t, data.v, trial);
  const periodOk = Math.abs(trial - best.p) / best.p < 0.04;
  const bestFit = fitSine(data.t, data.v, best.p);
  const [kGuess, setKGuess] = useState(0.5 * bestFit.amp);
  const kOk = Math.abs(kGuess - bestFit.amp) / bestFit.amp < 0.15;
  const setP = (p: number) => setPos(Math.min(1, Math.max(0, (Math.log10(p) - lo) / (hi - lo))));

  const phaseOf = (t: number, p: number) => (((t / p) % 1) + 1) % 1;
  const foldedX = data.t.map((t) => phaseOf(t, trial));
  const wave = (p: number, amp: number, f: ReturnType<typeof fitSine>, n = 120) => {
    const x: number[] = [], y: number[] = [];
    const w = (2 * Math.PI) / p;
    for (let i = 0; i <= n; i++) {
      const ph = i / n;
      x.push(ph);
      y.push(amp * Math.sin(w * ph * p + f.phase) + f.offset);
    }
    return { x, y };
  };
  const waveT = (() => {
    const x: number[] = [], y: number[] = [];
    for (let i = 0; i <= 400; i++) { const t = (i / 400) * data.baseline; x.push(t); y.push(fit.a * Math.sin((2 * Math.PI * t) / trial) + fit.b * Math.cos((2 * Math.PI * t) / trial) + fit.offset); }
    return { x, y };
  })();
  const foldFit = wave(trial, fit.amp, fit);
  const yMax = Math.max(...data.v.map(Math.abs)) * 1.15;

  const mass = massFromK(kGuess, best.p, pl.starMass);
  const trueMass = pl.massJup!;
  const years = (d: number) => (d > 700 ? ` (${(d / 365.25).toFixed(1)} years)` : '');

  const steps: StepDef[] = [
    {
      title: 'The idea',
      job: 'Read the idea. Then press Next.',
      ok: true,
      body: (
        <div className={`${PANEL} grid gap-4 md:grid-cols-[280px_1fr]`}>
          <Diagram method="rv" />
          <div className="space-y-3 text-[#dbe5ff]">
            <p>A planet and its star pull on each other. The planet is light, so it moves a lot. The star is heavy, so it only <b>wobbles</b> a tiny bit around the middle of the pair.</p>
            <p>We cannot see the wobble directly. But when the star moves toward us, its light turns a little <b className="text-[#93c5fd]">bluer</b>. When it moves away, its light turns a little <b className="text-[#fca5a5]">redder</b>. Measuring that colour shift gives the star’s speed.</p>
            <p>You will get {data.t.length} speed measurements of <b>{target.name}</b> taken over {Math.round(data.baseline)} days. Your job is to find the repeating wave hidden in them, then work out how heavy the planet is.</p>
            <Words items={[['Radial velocity', 'How fast the star moves toward or away from us, in metres per second (m/s). A walking person is about 1.5 m/s.'], ['Orbit time (period)', 'How long the planet takes to go around once. The wobble repeats with the same time.'], ['Minimum mass', 'We cannot tell how tilted the orbit is, so this method gives the least the planet could weigh.']]} />
          </div>
        </div>
      ),
    },
    {
      title: 'Find the repeat',
      job: 'Slide the orbit time until the dots line up in one clean wave in the bottom picture.',
      ok: periodOk,
      locked: 'Line the dots up (match above 90%) to continue.',
      body: (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={PANEL}>
            <h3 className="mb-2 font-semibold text-white">Star speed over time</h3>
            <Plot ariaLabel="Star speed measurements over time with your wave drawn over them" height={230} xLabel="Days" yLabel="Speed (m/s)" yRange={[-yMax, yMax]} series={[{ x: data.t, y: data.v, color: '#f9a8d4', size: 3 }, { ...waveT, color: '#fbbf24', kind: 'line' }]} />
            <p className="mt-2 text-sm text-[#b3c0da]">Positive = moving away from us. Negative = moving toward us. The yellow line is your guess.</p>
          </div>
          <div className={PANEL}>
            <h3 className="mb-2 font-semibold text-white">Same dots, folded every {trial.toFixed(trial < 10 ? 2 : 1)} days</h3>
            <Plot ariaLabel="Measurements folded on your orbit time" height={230} xLabel="Position in one orbit (0 to 1)" yLabel="Speed (m/s)" xRange={[0, 1]} yRange={[-yMax, yMax]} series={[{ x: foldedX, y: data.v, color: '#f9a8d4', size: 3 }, { ...foldFit, color: '#fbbf24', kind: 'line' }]} />
            <p className="mt-2 text-sm text-[#b3c0da]">When the orbit time is right, all the dots fall on one wave. If it is wrong, they look like a cloud.</p>
          </div>
          <div className={`${PANEL} space-y-3 lg:col-span-2`}>
            <Slider label="Orbit time to try" value={pos} min={0} max={1} step={0.0005} onChange={setPos} show={`${trial.toFixed(trial < 10 ? 3 : 1)} days${years(trial)}`} nudge={[0.002, 0.002]} hint="Use − and + to move in small steps." />
            <Meter label="How well the dots line up" value={fit.r2} good={periodOk} />
            <div>
              <div className="mb-1 text-sm font-semibold text-white">Every orbit time, tried for you (peaks = good match)</div>
              <MatchCurve ps={grid} vals={curve} cursor={trial} label="Match quality for every orbit time" />
            </div>
            {periodOk ? <Callout tone="good">Yes. The dots make one clean wave. The orbit time is about <b>{best.p.toFixed(best.p < 10 ? 3 : 1)} days</b>{years(best.p)}.</Callout> : <Callout tone="info">Move the slider toward a tall peak in the curve. Several peaks can look good; the tallest is usually right.</Callout>}
            <button type="button" className={BTN2} onClick={() => setP(best.p)}>Show me the answer</button>
          </div>
        </div>
      ),
    },
    {
      title: 'Measure the wobble',
      job: 'Stretch the yellow wave until it fits the dots. Its height is the star’s top speed.',
      ok: kOk,
      locked: 'Match the wave height to the dots to continue.',
      body: (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={PANEL}>
            <Plot
              ariaLabel="Folded measurements with your wave height"
              height={280}
              xLabel="Position in one orbit (0 to 1)"
              yLabel="Speed (m/s)"
              xRange={[0, 1]}
              yRange={[-yMax, yMax]}
              series={[
                { x: data.t.map((t) => phaseOf(t, best.p)), y: data.v.map((v) => v - bestFit.offset), color: '#f9a8d4', size: 3 },
                { x: wave(best.p, kGuess, { ...bestFit, offset: 0 }).x, y: wave(best.p, kGuess, { ...bestFit, offset: 0 }).y, color: '#fbbf24', kind: 'line' },
              ]}
            />
          </div>
          <div className={`${PANEL} space-y-3`}>
            <Slider label="Wave height (top speed of the star)" value={kGuess} min={0} max={bestFit.amp * 2.2} step={bestFit.amp / 200} onChange={setKGuess} show={`${kGuess.toFixed(kGuess < 10 ? 2 : 1)} m/s`} nudge={[bestFit.amp / 50, bestFit.amp / 50]} />
            {kOk ? <Callout tone="good">That fits. The star swings at about <b>{kGuess.toFixed(2)} m/s</b>. That is {kGuess < 3 ? 'slower than a walking person' : kGuess < 15 ? 'about the speed of a bicycle' : 'faster than a sprinter'}.</Callout> : <Callout tone="info">Make the yellow wave reach the top and bottom of the dots, not further.</Callout>}
            <button type="button" className={BTN2} onClick={() => setKGuess(bestFit.amp)}>Show me the answer</button>
          </div>
        </div>
      ),
    },
    {
      title: 'Weigh the planet',
      job: 'Read the result. The faster the star swings and the longer the orbit, the heavier the planet.',
      ok: true,
      body: (
        <div className="grid gap-4 md:grid-cols-2">
          <div className={`${PANEL} space-y-2`}>
            <h3 className="font-semibold text-white">Your measurement</h3>
            <p className="text-[#dbe5ff]">Orbit time: <b>{best.p.toFixed(best.p < 10 ? 3 : 1)} days</b>{years(best.p)}</p>
            <p className="text-[#dbe5ff]">Star speed: <b>{kGuess.toFixed(2)} m/s</b></p>
            <p className="text-[#dbe5ff]">Star weight: <b>{pl.starMass} Suns</b> (known)</p>
            <p className="text-xl font-semibold text-[#f9a8d4]">At least {fmtMass(mass)}</p>
            <p className="text-[#dbe5ff]">That is {massWords(mass)}.</p>
            <Callout tone="info">Why “at least”? If we look at the orbit from the side, we see all the wobble. If we look from above, we see none. A tilted orbit hides some, so the real planet can only be heavier.</Callout>
          </div>
          <div className={`${PANEL} space-y-2`}>
            <h3 className="font-semibold text-white">What astronomers found</h3>
            <p className="text-[#dbe5ff]">{target.known.note}</p>
            <p className="text-[#b3c0da]">Published mass: {fmtMass(trueMass)}. Yours: {fmtMass(mass)}. {Math.abs(mass - trueMass) / trueMass < 0.2 ? 'Very close.' : 'A bit different, and that is normal with noisy data.'}</p>
            <p className="text-sm text-[#b3c0da]">Good at: heavy planets close to their star. Weak at: small, far planets, because their pull is too gentle to measure.</p>
          </div>
        </div>
      ),
    },
  ];
  return <Shell method="rv" facts={planetFacts(pl)} heading={pl.label} steps={steps} onBack={onBack} picker={picker} />;
}
