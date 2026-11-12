'use client';

import { useMemo, useState } from 'react';
import type { SkyTarget } from '@/lib/catalog';
import { fitSine, logSpace, massFromLoop, planetOrbitAU, simulateAstro } from '@/lib/methods';
import { fmtMass, massWords } from './RvLab';
import { planetFacts } from '@/lib/progress';
import { BTN2, Callout, Diagram, hash, MatchCurve, Meter, PANEL, Shell, Slider, Words, type StepDef } from './ui';

function Track(p: { xs: number[]; ys: number[]; path?: Array<[number, number]>; circle?: number; R: number }) {
  const S = 380, c = S / 2, k = (S / 2 - 24) / p.R;
  const X = (v: number) => c + v * k, Y = (v: number) => c - v * k;
  const d = p.path ? p.path.map((q, i) => `${i ? 'L' : 'M'}${X(q[0]).toFixed(1)},${Y(q[1]).toFixed(1)}`).join('') + 'Z' : null;
  const step = p.R > 20 ? 10 : p.R > 4 ? 2 : p.R > 1 ? 0.5 : 0.1;
  const tk: number[] = [];
  for (let v = -Math.floor(p.R / step) * step; v <= p.R; v += step) tk.push(+v.toFixed(4));
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto w-full max-w-[420px]" role="img" aria-label="Position of the star on the sky over time">
      <rect width={S} height={S} fill="#0b1220" stroke="#3d4d78" />
      {tk.map((v) => (<g key={v}><line x1={X(v)} x2={X(v)} y1={0} y2={S} stroke="#1c2a48" /><line y1={Y(v)} y2={Y(v)} x1={0} x2={S} stroke="#1c2a48" />{Math.abs(v) > 1e-9 ? <text x={X(v)} y={S - 4} fontSize="10" fill="#b3c0da" textAnchor="middle">{v}</text> : null}</g>))}
      <line x1={c} x2={c} y1={0} y2={S} stroke="#3d4d78" /><line y1={c} y2={c} x1={0} x2={S} stroke="#3d4d78" />
      {p.circle ? <circle cx={c} cy={c} r={p.circle * k} fill="none" stroke="#fbbf24" strokeWidth="2" strokeDasharray="6 4" /> : null}
      {d ? <path d={d} fill="none" stroke="#4ade80" strokeWidth="2" /> : null}
      {p.xs.map((x, i) => <circle key={i} cx={X(x)} cy={Y(p.ys[i]!)} r={3.5} fill="#bbf7d0" />)}
      <text x={S - 6} y={S - 18} textAnchor="end" fontSize="10" fill="#b3c0da">East–west shift (mas) →</text>
      <text x={8} y={14} fontSize="10" fill="#b3c0da">↑ North–south shift (mas)</text>
    </svg>
  );
}

export function AstroLab({ target, onBack, picker }: { target: SkyTarget; onBack: () => void; picker: React.ReactNode }) {
  const pl = target.planet!;
  const d = useMemo(() => simulateAstro({ seed: hash(target.id), period: pl.periodDays!, mjup: pl.massJup!, starMass: pl.starMass, distLy: pl.distLy! }), [target.id, pl]);
  const grid = useMemo(() => logSpace(Math.max(2, d.period / 12), d.t[d.t.length - 1]! / 1.3, 400), [d]);
  const both = (p: number) => (fitSine(d.t, d.x, p).r2 + fitSine(d.t, d.y, p).r2) / 2;
  const curve = useMemo(() => grid.map(both), [grid, d]); // eslint-disable-line react-hooks/exhaustive-deps
  const best = useMemo(() => {
    let k = 0;
    curve.forEach((v, i) => { if (v > curve[k]!) k = i; });
    const fine = logSpace(grid[Math.max(0, k - 1)]!, grid[Math.min(grid.length - 1, k + 1)]!, 100);
    let bp = grid[k]!, br = -1;
    for (const p of fine) { const r = both(p); if (r > br) { br = r; bp = p; } }
    return bp;
  }, [curve, grid]); // eslint-disable-line react-hooks/exhaustive-deps

  const lo = Math.log10(grid[0]!), hi = Math.log10(grid[grid.length - 1]!);
  const [pos, setPos] = useState(() => 0.35 + (hash(target.id) % 20) / 100);
  const trial = Math.pow(10, lo + pos * (hi - lo));
  const fx = fitSine(d.t, d.x, trial), fy = fitSine(d.t, d.y, trial);
  const r2 = (fx.r2 + fy.r2) / 2;
  const periodOk = Math.abs(trial - best) / best < 0.05;
  const path: Array<[number, number]> = [];
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * 2 * Math.PI;
    path.push([fx.a * Math.sin(a) + fx.b * Math.cos(a), fy.a * Math.sin(a) + fy.b * Math.cos(a)]);
  }
  const bx = fitSine(d.t, d.x, best), by = fitSine(d.t, d.y, best);
  let L = 0;
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * 2 * Math.PI;
    L = Math.max(L, Math.hypot(bx.a * Math.sin(a) + bx.b * Math.cos(a), by.a * Math.sin(a) + by.b * Math.cos(a)));
  }
  const R = Math.max(...d.x.map(Math.abs), ...d.y.map(Math.abs)) * 1.25;
  const [g, setG] = useState(L * 0.4);
  const gOk = Math.abs(g - L) / L < 0.2;
  const mass = massFromLoop(g, pl.distLy!, pl.starMass, best);
  const aStarAU = (g / 1000) * (pl.distLy! / 3.2616);
  const aP = planetOrbitAU(pl.starMass, best);
  const fmtP = (p: number) => (p > 700 ? `${(p / 365.25).toFixed(1)} years` : `${p.toFixed(0)} days`);
  const setP = (p: number) => setPos(Math.min(1, Math.max(0, (Math.log10(p) - lo) / (hi - lo))));

  const steps: StepDef[] = [
    {
      title: 'The idea',
      job: 'Read the idea. Then press Next.',
      ok: true,
      body: (
        <div className={`${PANEL} grid gap-4 md:grid-cols-[280px_1fr]`}>
          <Diagram method="astrometry" />
          <div className="space-y-3 text-[#dbe5ff]">
            <p>A star with a planet does not sit still. Both circle their shared middle point, so the star traces a tiny circle (or oval) on the sky. A bigger planet or a wider orbit makes a bigger circle.</p>
            <p>The circle is very small, usually a thousandth of an arcsecond. That is like spotting a hair from 100 km away. It takes a space telescope such as Gaia to measure it.</p>
            <p>You get the star’s position on the sky at {d.t.length} dates. Find how long one loop takes and how big it is, then work out the planet’s weight.</p>
            <Words items={[['Milli-arcsecond (mas)', 'One thousandth of an arcsecond. A really tiny angle.'], ['Orbit time', 'How long one loop takes. The planet and the star both take this long.']]} />
          </div>
        </div>
      ),
    },
    {
      title: 'Find the loop',
      job: 'Slide the orbit time until the green oval runs through the dots.',
      ok: periodOk,
      locked: 'Fit the oval through the dots (match above 90%) to continue.',
      body: (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={PANEL}><Track xs={d.x} ys={d.y} path={path} R={R} /></div>
          <div className={`${PANEL} space-y-3`}>
            <Slider label="Orbit time to try" value={pos} min={0} max={1} step={0.0005} onChange={setPos} show={fmtP(trial)} nudge={[0.002, 0.002]} hint="Use − and + to move in small steps." />
            <Meter label="How well the oval fits the dots" value={r2} good={periodOk} />
            <div>
              <div className="mb-1 text-sm font-semibold text-white">Every orbit time, tried for you (peaks = good match)</div>
              <MatchCurve ps={grid} vals={curve} cursor={trial} label="Match quality for every orbit time" />
            </div>
            {periodOk ? <Callout tone="good">The oval fits. One loop takes about <b>{fmtP(best)}</b>.</Callout> : <Callout tone="info">Look for the tallest peak. A wrong orbit time makes a messy tangle that misses the dots.</Callout>}
            <button type="button" className={BTN2} onClick={() => setP(best)}>Show me the answer</button>
          </div>
        </div>
      ),
    },
    {
      title: 'Measure the loop',
      job: 'Change the dashed circle until it is as big as the star’s loop.',
      ok: gOk,
      locked: 'Match the size of the loop to continue.',
      body: (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={PANEL}><Track xs={d.x} ys={d.y} R={R} circle={g} /></div>
          <div className={`${PANEL} space-y-3`}>
            <Slider label="Size of the loop (radius)" value={g} min={0.02 * R} max={R} step={R / 400} onChange={setG} show={`${g.toFixed(g < 1 ? 3 : 2)} mas`} nudge={[R / 100, R / 100]} />
            {gOk ? <Callout tone="good">That fits. The star moves about <b>{g.toFixed(2)} mas</b> from the middle. The oval is flatter than your circle because we see the orbit tilted.</Callout> : <Callout tone="info">Match the dashed circle to the longest reach of the dots from the centre.</Callout>}
            <button type="button" className={BTN2} onClick={() => setG(L)}>Show me the answer</button>
          </div>
        </div>
      ),
    },
    {
      title: 'Weigh the planet',
      job: 'Use the loop size to find the planet’s weight.',
      ok: true,
      body: (
        <div className="grid gap-4 md:grid-cols-2">
          <div className={`${PANEL} space-y-2 text-[#dbe5ff]`}>
            <p>1. Loop size in real space: {g.toFixed(2)} mas × {(pl.distLy! / 3.2616).toFixed(1)} parsecs ÷ 1000 = <b>{aStarAU.toFixed(4)} AU</b></p>
            <p>2. The planet’s orbit, from its orbit time ({fmtP(best)}) and the star’s weight ({pl.starMass} Suns): <b>{aP.toFixed(3)} AU</b></p>
            <p>3. A see-saw: the heavier side moves less. So <i>planet weight ÷ star weight = star’s loop ÷ planet’s orbit</i>.</p>
            <p className="text-xl font-semibold text-[#86efac]">About {fmtMass(mass)}</p>
            <p>That is {massWords(mass)}.</p>
          </div>
          <div className={`${PANEL} space-y-2`}>
            <h3 className="font-semibold text-white">What astronomers found</h3>
            <p className="text-[#dbe5ff]">{target.known.note}</p>
            <p className="text-sm text-[#b3c0da]">Published mass: {fmtMass(pl.massJup!)}. Good at: far-out, heavy planets around nearby stars, and it gives the true mass, not a minimum. Weak at: the loops are tiny, so only a few planets have been found this way. Gaia is expected to find many more.</p>
          </div>
        </div>
      ),
    },
  ];
  return <Shell method="astrometry" facts={planetFacts(pl)} heading={pl.label} steps={steps} onBack={onBack} picker={picker} />;
}
