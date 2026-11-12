'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from 'react';
import type { SkyTarget } from '@/lib/catalog';
import { lensMagnification, simulateMicro } from '@/lib/methods';
import { loadOgle, microFromOgle } from '@/lib/microreal';
import { Plot } from '../Plot';
import { fmtMass, massWords } from './RvLab';
import { planetFacts } from '@/lib/progress';
import { BTN2, Callout, Diagram, hash, PANEL, Shell, Slider, Words, type StepDef } from './ui';

export function MicroLab({ target, onBack, picker }: { target: SkyTarget; onBack: () => void; picker: React.ReactNode }) {
  const pl = target.planet!;
  const sim = useMemo(() => simulateMicro({ seed: hash(target.id), mjup: pl.massJup!, hostMass: pl.starMass }), [target.id, pl]);
  const [real, setReal] = useState<typeof sim | null>(null);
  const [looking, setLooking] = useState(false);
  useEffect(() => {
    setReal(null);
    if (!/^OGLE-20(1[1-9]|[2-9]\d)-BLG-\d{4}$/i.test(target.name)) return;
    let live = true;
    setLooking(true);
    loadOgle(target.name)
      .then((p) => (p ? microFromOgle(p, pl.massJup!, pl.starMass) : null))
      .then((m) => live && setReal(m))
      .finally(() => live && setLooking(false));
    return () => { live = false; };
  }, [target.name, pl]);
  const d = real ?? sim;
  // The peak is easy to see, so we centre it for the student.
  const [tE, setTE] = useState(d.tE * 1.6);
  const [u0, setU0] = useState(0.4);
  const [w, setW] = useState(2);
  useEffect(() => { setTE(d.tE * 1.6); setU0(0.4); }, [real]); // eslint-disable-line react-hooks/exhaustive-deps

  const model = d.t.map((t) => lensMagnification(t, d.t0, tE, u0));
  const resid = d.t.map((t, i) => d.f[i]! - model[i]!);
  // Judge the fit away from the planet blip.
  let chi = 0, n = 0;
  d.t.forEach((t, i) => {
    if (Math.abs(t - d.tp) > 4 * d.fwhm) {
      chi += (resid[i]! / (d.sigma * model[i]!)) ** 2;
      n++;
    }
  });
  const chi2 = chi / Math.max(1, n);
  const fitOk = chi2 < 2.5;

  const trueModel = d.t.map((t) => lensMagnification(t, d.t0, d.tE, d.u0));
  const trueResid = d.t.map((t, i) => d.f[i]! - trueModel[i]!);
  // Where is the biggest leftover?
  let kMax = 0;
  trueResid.forEach((v, i) => { if (v > trueResid[kMax]!) kMax = i; });
  const tFlash = d.t[kMax]!;
  const widthOk = Math.abs(w - d.fwhm) / d.fwhm < 0.3;
  const peakAmp = trueResid[kMax]!;
  const flashShape = (c: number, fw: number) => {
    const x: number[] = [], y: number[] = [];
    const sg = fw / 2.355;
    for (let t = tFlash - 4 * d.fwhm - 2; t <= tFlash + 4 * d.fwhm + 2; t += Math.max(0.01, d.fwhm / 12)) { x.push(t); y.push(peakAmp * Math.exp(-0.5 * ((t - c) / sg) ** 2)); }
    return { x, y };
  };
  const q = (w / tE) ** 2;
  const qTrue = d.q;
  const trueMass = (qTrue * d.hostMass) / 9.546e-4;
  const near = (x: number) => Math.abs(x - tFlash) < 4 * d.fwhm + 2;
  const zoom = { x: d.t.filter(near), y: trueResid.filter((_, i) => near(d.t[i]!)) };
  const hours = (days: number) => (days < 1 ? `${Math.round(days * 24)} hours` : `${days.toFixed(1)} days`);

  const steps: StepDef[] = [
    {
      title: 'The idea',
      job: 'Read the idea. Then press Next.',
      ok: true,
      body: (
        <div className={`${PANEL} grid gap-4 md:grid-cols-[280px_1fr]`}>
          <Diagram method="microlensing" />
          <div className="space-y-3 text-[#dbe5ff]">
            <p className="eyebrow" role="status">{looking ? 'Checking for real OGLE data…' : real ? 'Real OGLE telescope data' : 'Practice data, modeled on this planet'}</p>
            <p>Gravity bends light. When one star drifts exactly in front of a much further star, its gravity acts like a lens and the far star <b>brightens</b> for a few weeks, then fades. That smooth hump happens once. It never repeats.</p>
            <p>If the lens star has a planet, the planet’s own gravity adds a short extra flash on top of the hump, lasting hours or days. That flash is the planet.</p>
            <p>This method can find small, cold planets very far away, even thousands of light-years. But you cannot go back and look again.</p>
            <Words items={[['Lens', 'The nearer star whose gravity bends the light.'], ['Magnification', 'How many times brighter the far star looks. 1 = normal.'], ['Einstein time', 'How long the big hump lasts (about a month). Longer = heavier or slower lens.']]} />
          </div>
        </div>
      ),
    },
    {
      title: 'Fit the big hump',
      job: 'Make the yellow curve match the big hump of dots. The bottom graph shows what is left over.',
      ok: fitOk,
      locked: 'Match the hump closely to continue.',
      body: (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={PANEL}>
            <h3 className="mb-2 font-semibold text-white">Brightness of the far star</h3>
            <Plot ariaLabel="Brightness of the far star with your curve" height={250} xLabel="Days" yLabel="Times brighter" series={[{ x: d.t, y: d.f, color: '#c4b5fd', size: 2.5 }, { x: d.t, y: model, color: '#fbbf24', kind: 'line' }]} />
            <h3 className="mb-2 mt-3 font-semibold text-white">Left over after your curve</h3>
            <Plot ariaLabel="Leftover brightness after subtracting your curve" height={150} xLabel="Days" yLabel="Leftover" yRange={[-0.6, 0.9]} series={[{ x: d.t, y: resid, color: '#86efac', size: 2.5 }]} />
          </div>
          <div className={`${PANEL} space-y-3`}>
            <Slider label="How long the hump lasts" value={tE} min={5} max={70} step={0.5} onChange={setTE} show={`${tE.toFixed(0)} days`} nudge={[0.5, 0.5]} />
            <Slider label="How tall the peak is" value={u0} min={0.04} max={0.7} step={0.005} onChange={setU0} show={`${(1 / u0).toFixed(1)}× peak`} hint="Closer pass = taller peak. The slider shows an approximate peak height." nudge={[0.01, 0.01]} />
            {fitOk ? <Callout tone="good">The hump matches. Look at the green graph: almost everything is flat except a short spike. <b>That spike is not explained by the star alone.</b></Callout> : <Callout tone="info">Change the two sliders until the green dots lie flat along zero.</Callout>}
            <button type="button" className={BTN2} onClick={() => { setTE(d.tE); setU0(d.u0); }}>Show me the answer</button>
          </div>
        </div>
      ),
    },
    {
      title: 'Measure the flash',
      job: 'Zoom in on the spike. Stretch the yellow bump so it is as long as the green flash.',
      ok: widthOk,
      locked: 'Match the length of the flash to continue.',
      body: (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={PANEL}>
            <Plot ariaLabel="Zoomed view of the extra flash with your bump" height={290} xLabel="Days" yLabel="Extra brightness" series={[{ x: zoom.x, y: zoom.y, color: '#86efac', size: 3 }, { ...flashShape(tFlash, w), color: '#fbbf24', kind: 'line' }]} />
          </div>
          <div className={`${PANEL} space-y-3`}>
            <Slider label="How long the flash lasts" value={w} min={0.05} max={8} step={0.05} onChange={setW} show={hours(w)} hint="Measure across the middle of the bump, where it is half as tall as its top." nudge={[0.05, 0.05]} />
            {widthOk ? <Callout tone="good">That fits. The flash lasts about <b>{hours(w)}</b>.</Callout> : <Callout tone="info">Make the yellow bump as wide as the green dots at half its height.</Callout>}
            <button type="button" className={BTN2} onClick={() => setW(d.fwhm)}>Show me the answer</button>
          </div>
        </div>
      ),
    },
    {
      title: 'Weigh the planet',
      job: 'Compare the flash length with the hump length. That ratio reveals the planet’s weight.',
      ok: true,
      body: (
        <div className="grid gap-4 md:grid-cols-2">
          <div className={`${PANEL} space-y-2 text-[#dbe5ff]`}>
            <p>Hump length: <b>{tE.toFixed(0)} days</b>. Flash length: <b>{hours(w)}</b>.</p>
            <p className="rounded-lg bg-[#050506] p-3 font-mono text-sm">(flash ÷ hump)² = ({w.toFixed(2)} ÷ {tE.toFixed(0)})² = <b className="text-[#fbbf24]">{q.toExponential(1)}</b></p>
            <p>So the planet weighs about <b>{(q * 1000).toFixed(2)}</b> thousandths of its star.</p>
            <p>The lens star weighs about <b>{pl.starMass} Suns</b>, so the planet is about <b className="text-[#c4b5fd]">{fmtMass((q * pl.starMass) / 9.546e-4)}</b>: {massWords((q * pl.starMass) / 9.546e-4)}.</p>
          </div>
          <div className={`${PANEL} space-y-2`}>
            <h3 className="font-semibold text-white">What astronomers found</h3>
            <p className="text-[#dbe5ff]">{target.known.note}</p>
            <p className="text-sm text-[#b3c0da]">True ratio in this practice event: {qTrue.toExponential(1)} (mass {fmtMass(trueMass)}).</p>
            <p className="text-sm text-[#b3c0da]">Good at: cold, far, small planets, and planets in our galaxy’s crowded centre. Weak at: you only get one look; the event never repeats.</p>
          </div>
        </div>
      ),
    },
  ];
  return <Shell method="microlensing" facts={planetFacts(pl)} heading={pl.label} steps={steps} onBack={onBack} picker={picker} />;
}
