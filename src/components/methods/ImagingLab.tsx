'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SkyTarget } from '@/lib/catalog';
import { imagingGeometry } from '@/lib/methods';
import { rng } from '@/lib/simulate';
import { fmtMass } from './RvLab';
import { BTN2, Callout, Diagram, hash, PANEL, Shell, Slider, Words, type StepDef } from './ui';

const N = 340;
const G0 = 0.05;
const glare = (rho: number) => 1 / (1 + Math.pow(rho / G0, 2.2));
const SCALE = 0.004;

interface Scene {
  speck: Float32Array;
  planet: { x: number; y: number; dx: number; dy: number };
  bg: Array<{ x: number; y: number; amp: number }>;
  shift: { x: number; y: number };
  noise: Float32Array;
}
const RHO_P = 0.53;

function makeScene(seed: number): Scene {
  const r = rng(seed);
  const G = 48;
  const grid = new Float32Array(G * G).map(() => r() * 2 - 1);
  const speck = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const gx = (x / N) * (G - 1), gy = (y / N) * (G - 1);
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const fx = gx - x0, fy = gy - y0;
      const a = grid[y0 * G + x0]!, b = grid[y0 * G + Math.min(G - 1, x0 + 1)]!, c = grid[Math.min(G - 1, y0 + 1) * G + x0]!, d = grid[Math.min(G - 1, y0 + 1) * G + Math.min(G - 1, x0 + 1)]!;
      speck[y * N + x] = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
    }
  const noise = new Float32Array(N * N).map(() => (r() + r() + r() - 1.5) * 0.00022);
  const ang = r() * 6.28;
  const planet = { x: Math.cos(ang) * RHO_P, y: Math.sin(ang) * RHO_P, dx: -Math.sin(ang) * 0.015, dy: Math.cos(ang) * 0.015 };
  const bg: Scene['bg'] = [];
  const amps = [0.9, 0.55, 0.4];
  for (let i = 0; i < 3; i++) {
    for (;;) {
      const x = (r() * 2 - 1) * 0.85, y = (r() * 2 - 1) * 0.85;
      if (Math.hypot(x, y) < 0.4) continue;
      if (Math.hypot(x - planet.x, y - planet.y) < 0.3) continue;
      if (bg.some((b) => Math.hypot(b.x - x, b.y - y) < 0.3)) continue;
      bg.push({ x, y, amp: amps[i]! });
      break;
    }
  }
  const sa = r() * 6.28;
  return { speck, planet, bg, shift: { x: Math.cos(sa) * 0.17, y: Math.sin(sa) * 0.17 }, noise };
}

function draw(c: HTMLCanvasElement, sc: Scene, mask: number, sub: number, epoch: 1 | 2) {
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(N, N);
  const half = N / 2;
  const sources: Array<{ x: number; y: number; amp: number }> = [
    { x: sc.planet.x + (epoch === 2 ? sc.planet.dx : 0), y: sc.planet.y + (epoch === 2 ? sc.planet.dy : 0), amp: 0.5 },
    ...sc.bg.map((b) => ({ x: b.x + (epoch === 2 ? sc.shift.x : 0), y: b.y + (epoch === 2 ? sc.shift.y : 0), amp: b.amp })),
  ];
  const s2 = 0.022 * 0.022;
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const x = (px - half) / half, y = (py - half) / half;
      const rho = Math.hypot(x, y);
      const g = glare(rho);
      let I = g * (1 + 0.07 * sc.speck[py * N + px]!) - sub * g + sc.noise[py * N + px]!;
      for (const s of sources) {
        const d2 = (x - s.x) ** 2 + (y - s.y) ** 2;
        if (d2 < 0.02) I += s.amp * SCALE * 0.5 * Math.exp(-d2 / (2 * s2));
      }
      let v = Math.max(0, Math.min(1, I / SCALE));
      if (rho < mask) v = 0;
      v = Math.sqrt(v);
      const k = (py * N + px) * 4;
      img.data[k] = 40 + v * 215;
      img.data[k + 1] = 40 + v * 215;
      img.data[k + 2] = 55 + v * 200;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (mask > 0) {
    ctx.strokeStyle = '#4561a0';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(half, half, mask * half, 0, 6.2832);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export function ImagingLab({ target, onBack, picker }: { target: SkyTarget; onBack: () => void; picker: React.ReactNode }) {
  const pl = target.planet!;
  const sc = useMemo(() => makeScene(hash(target.id)), [target.id]);
  const geo = imagingGeometry(pl.sepAU!, pl.distLy!, pl.starMass);
  const [mask, setMask] = useState(0);
  const [sub, setSub] = useState(0);
  const [epoch, setEpoch] = useState<1 | 2>(1);
  const [blink, setBlink] = useState(false);
  const [picked, setPicked] = useState<{ x: number; y: number; real: boolean } | null>(null);
  const [step, setStep] = useState(0);
  const cv = useRef<HTMLCanvasElement>(null);
  const cleanOk = sub >= 0.85 && mask >= 0.22 && mask <= 0.45;
  const m = step >= 2 ? 0.3 : mask;
  const s = step >= 2 ? 1 : sub;

  useEffect(() => {
    if (cv.current) draw(cv.current, sc, m, s, epoch);
  }, [sc, m, s, epoch]);
  useEffect(() => {
    if (!blink) return;
    const iv = setInterval(() => setEpoch((e) => (e === 1 ? 2 : 1)), 800);
    return () => clearInterval(iv);
  }, [blink]);

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1;
      const y = ((e.clientY - r.top) / r.height) * 2 - 1;
      const cand = [
        { x: sc.planet.x + (epoch === 2 ? sc.planet.dx : 0), y: sc.planet.y + (epoch === 2 ? sc.planet.dy : 0), real: true },
        ...sc.bg.map((b) => ({ x: b.x + (epoch === 2 ? sc.shift.x : 0), y: b.y + (epoch === 2 ? sc.shift.y : 0), real: false })),
      ];
      let best = cand[0]!, bd = 9;
      for (const c of cand) { const d = Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; best = c; } }
      if (bd < 0.12) setPicked({ x: best.x, y: best.y, real: best.real });
      else setPicked(null);
    },
    [sc, epoch],
  );

  const canvasBlock = (
    <div className="relative mx-auto w-full max-w-[460px]">
      <canvas ref={cv} width={N} height={N} onClick={step === 2 ? onClick : undefined} className={`w-full rounded-xl border border-[#3d4d78] ${step === 2 ? 'cursor-crosshair' : ''}`} role="img" aria-label="Simulated telescope photo of the star and its surroundings" />
      {picked ? <div className="pointer-events-none absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ left: `${((picked.x + 1) / 2) * 100}%`, top: `${((picked.y + 1) / 2) * 100}%`, borderColor: picked.real ? '#4ade80' : '#f87171' }} /> : null}
    </div>
  );

  const measured = picked?.real ? Math.hypot(picked.x, picked.y) : RHO_P;
  const halfFov = geo.arcsec / RHO_P; // arcseconds from the centre to the picture edge
  const sepArc = measured * halfFov;
  const sepAU = sepArc * geo.pc;
  const periodYr = Math.sqrt(sepAU ** 3 / pl.starMass);

  const steps: StepDef[] = [
    {
      title: 'The idea',
      job: 'Read the idea. Then press Next.',
      ok: true,
      body: (
        <div className={`${PANEL} grid gap-4 md:grid-cols-[280px_1fr]`}>
          <Diagram method="imaging" />
          <div className="space-y-3 text-[#dbe5ff]">
            <p>Planets do not make their own light. They only reflect a little of their star’s light, so a planet is thousands to billions of times fainter than its star. Next to the star’s glare it is invisible, like a candle beside a searchlight.</p>
            <p>To <b>photograph</b> one, astronomers do two things: block the star’s bright centre with a small disc, and subtract the leftover glow with a computer. Then a faint dot can appear.</p>
            <p>But a dot could also be a far-away star in the background. To tell them apart you photograph the same spot again later. Background stars shift. A real planet stays with its star.</p>
            <Words items={[['Coronagraph', 'A small disc inside the telescope that blocks the star’s centre.'], ['Arcsecond', 'A tiny angle. One arcsecond is the width of a coin seen from 4 km away.'], ['Parsec', 'A distance unit: 3.26 light-years. Handy because arcseconds × parsecs = AU.'], ['AU', 'The distance from Earth to the Sun.']]} />
          </div>
        </div>
      ),
    },
    {
      title: 'Hide the glare',
      job: 'Use both sliders to remove the star’s light. A faint dot should appear.',
      ok: cleanOk,
      locked: 'Use the disc size around 0.25–0.4 and remove nearly all the leftover glow.',
      body: (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={PANEL}>{canvasBlock}</div>
          <div className={`${PANEL} space-y-3`}>
            <Slider label="Disc that blocks the star’s centre" value={mask} min={0} max={0.45} step={0.01} onChange={setMask} show={mask === 0 ? 'none' : `${Math.round(mask * 100)}%`} hint="Bigger hides more of the centre. Too big would hide the planet too." />
            <Slider label="Remove the leftover glow" value={sub} min={0} max={1} step={0.01} onChange={setSub} show={`${Math.round(sub * 100)}%`} hint="The computer subtracts the star’s average glow." />
            {cleanOk ? <Callout tone="good">The glare is gone. Several faint dots remain. In the next step you will find out which one is the planet.</Callout> : <Callout tone="info">Start with the glow slider. Then grow the disc until the bright blob in the middle disappears.</Callout>}
            <button type="button" className={BTN2} onClick={() => { setMask(0.3); setSub(1); }}>Show me the answer</button>
          </div>
        </div>
      ),
    },
    {
      title: 'Which dot is real?',
      job: 'Four dots are visible. One is a planet; three are background stars. Compare the two photos, then click the planet.',
      ok: !!picked?.real,
      locked: 'Click the dot that stays with the star.',
      body: (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={PANEL}>{canvasBlock}</div>
          <div className={`${PANEL} space-y-3`}>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BTN2} aria-pressed={epoch === 1} onClick={() => { setBlink(false); setEpoch(1); }}>Photo 1 (this year)</button>
              <button type="button" className={BTN2} aria-pressed={epoch === 2} onClick={() => { setBlink(false); setEpoch(2); }}>Photo 2 (one year later)</button>
              <button type="button" className={BTN2} aria-pressed={blink} onClick={() => setBlink((b) => !b)}>{blink ? 'Stop flipping' : 'Flip between them'}</button>
            </div>
            <p className="text-sm text-[#b3c0da]">The star is always in the middle. Watch which dots slide across the picture and which barely move.</p>
            {picked ? (picked.real ? <Callout tone="good">Yes. This dot stays in nearly the same place relative to the star. It travels with the star, so it is a companion: the planet.</Callout> : <Callout tone="warn">That dot slid across the picture between the two photos. It is a background star: it is not tied to our star. Try another.</Callout>) : <Callout tone="info">Click a dot on the picture.</Callout>}
          </div>
        </div>
      ),
    },
    {
      title: 'How far out?',
      job: 'Turn the picture into real distances and an orbit time.',
      ok: true,
      body: (
        <div className="grid gap-4 md:grid-cols-2">
          <div className={PANEL}>{canvasBlock}</div>
          <div className={`${PANEL} space-y-2 text-[#dbe5ff]`}>
            <p>Gap between star and planet in the photo: <b>{sepArc.toFixed(2)} arcseconds</b></p>
            <p>Distance to the star: <b>{geo.pc.toFixed(1)} parsecs</b> ({Math.round(pl.distLy!)} light-years)</p>
            <p className="rounded-lg bg-[#050506] p-3 font-mono text-sm">{sepArc.toFixed(2)} × {geo.pc.toFixed(1)} = <b className="text-[#fbbf24]">{sepAU.toFixed(1)} AU</b></p>
            <p>That is {(sepAU / 5.2).toFixed(1)} times Jupiter’s distance from our Sun.</p>
            <p>With the star’s weight ({pl.starMass} Suns), Kepler’s law gives an orbit of <b>{periodYr < 1000 ? periodYr.toFixed(1) : Math.round(periodYr)} years</b>. We would have to wait that long to see one lap.</p>
            <Callout tone="info">Published: {target.known.note}{pl.massJup ? ` Mass about ${fmtMass(pl.massJup)}.` : ''} Imaging only finds young, hot, big planets far from their stars.</Callout>
          </div>
        </div>
      ),
    },
  ];
  return <Shell method="imaging" heading={pl.label} steps={steps.map((x, i) => ({ ...x, body: <StepTrack i={i} set={setStep}>{x.body}</StepTrack> }))} onBack={onBack} picker={picker} />;
}

/** Tells the lab which step is showing. */
function StepTrack({ i, set, children }: { i: number; set: (n: number) => void; children: React.ReactNode }) {
  useEffect(() => { set(i); }, [i, set]);
  return <>{children}</>;
}
