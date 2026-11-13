'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plot } from './Plot';
import { Meter } from './methods/ui';
import { autoPeriodRv, foldRv, IMG, scoreCall, scoreImaging, type AstroPuzzle, type ImgPuzzle, type MicroPuzzle, type RvPuzzle } from '@/lib/huntmore';
import { score, type Score, type Verdict } from '@/lib/hunt';

type Done = (s: Score, v: Verdict) => void;
const CALLS: Record<string, Array<[Verdict, string, string]>> = {
  rv: [
    ['planet', 'A planet', 'A small, steady swing that repeats'],
    ['binary', 'Two stars', 'A huge swing, far bigger than a planet makes'],
    ['none', 'Nothing there', 'Just noise, no repeating swing'],
  ],
  micro: [
    ['planet', 'A planet', 'A short extra bump on top of the smooth flash'],
    ['none', 'Just a star', 'Every point follows the smooth curve'],
  ],
  astro: [
    ['planet', 'A planet', 'The positions trace a loop'],
    ['none', 'Nothing there', 'A random cloud, no loop'],
  ],
};

function Calls({ kind, verdict, setVerdict, onSubmit, extra }: { kind: string; verdict: Verdict | null; setVerdict: (v: Verdict) => void; onSubmit: () => void; extra?: React.ReactNode }) {
  return (
    <section className="panel rounded-xl p-4" aria-label="Your call">
      <div className="eyebrow">Your call</div>
      <div className="mt-2 grid gap-2" role="group" aria-label="What is it?">
        {CALLS[kind]!.map(([v, t, d]) => (
          <button key={v} type="button" aria-pressed={verdict === v} className="pill min-h-14 flex-col !items-start !justify-center px-4 text-left" onClick={() => setVerdict(v)}>
            <span className="text-sm font-semibold">{t}</span>
            <span className="text-xs font-normal opacity-70">{d}</span>
          </button>
        ))}
      </div>
      <button type="button" className="pill-primary mt-3 min-h-12 w-full" disabled={!verdict} onClick={onSubmit}>Lock in my answer</button>
      {extra}
    </section>
  );
}

/* ---- Wobble ---- */
const LO = 1, HI = 30;
const toX = (p: number) => Math.round((Math.log(p / LO) / Math.log(HI / LO)) * 1000);
const toP = (x: number) => LO * Math.pow(HI / LO, x / 1000);

export function RvView({ puzzle, locked, onDone }: { puzzle: RvPuzzle; locked: boolean; onDone: Done }) {
  const [x, setX] = useState(() => toX(5));
  const [helped, setHelped] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const period = toP(x);
  const fold = useMemo(() => foldRv(puzzle.t, puzzle.v, period), [puzzle, period]);
  const nudge = (f: number) => setX(toX(Math.min(HI, Math.max(LO, period * f))));
  const spread = Math.max(...puzzle.v) - Math.min(...puzzle.v);
  return (
    <>
      <section className="panel rounded-xl p-3" aria-label="Star speed over time">
        <div className="eyebrow mb-1 px-1">Star speed over 60 days</div>
        <Plot series={[{ x: puzzle.t, y: puzzle.v, color: '#fbbf24', size: 2 }]} height={180} xLabel="Days" yLabel="Speed (m/s)" ariaLabel="The star's speed toward and away from us over 60 days" />
        <p className="mt-2 px-1 text-xs text-[#8a8a96]">Up means moving away from us, down means toward us. The whole range here is {Math.round(spread).toLocaleString()} m/s. A planet swings a star by 1 to 200 m/s.</p>
      </section>
      {locked ? null : (
        <>
          <section className="panel rounded-xl p-3" aria-label="Fold the speeds">
            <div className="eyebrow mb-1 px-1">Try a repeat time</div>
            <Plot series={[{ x: fold.phase, y: fold.v, color: '#8a8a96', size: 1.8 }, { x: fold.bx, y: fold.by, color: '#fbbf24', kind: 'line' }]} height={180} xRange={[0, 1]} xLabel="Share of one cycle" yLabel="Speed (m/s)" ariaLabel={`Speeds folded every ${period.toFixed(2)} days`} />
            <div className="mt-3 flex items-baseline justify-between px-1">
              <label htmlFor="rv-p" className="text-sm font-semibold text-white">Repeats every</label>
              <span className="font-mono text-lg text-white">{period.toFixed(2)} days</span>
            </div>
            <input id="rv-p" type="range" min={0} max={1000} step={1} value={x} onChange={(e) => setX(Number(e.target.value))} aria-label="Repeat time in days" />
            <div className="mt-2 grid grid-cols-4 gap-2">
              {([['−5%', 0.95], ['−0.5%', 0.995], ['+0.5%', 1.005], ['+5%', 1.05]] as const).map(([l, f]) => (
                <button key={l} type="button" className="pill min-h-11 text-xs" onClick={() => nudge(f)}>{l}</button>
              ))}
            </div>
            <div className="mt-3 px-1"><Meter label="Signal" value={fold.strength} good={fold.strength > 0.6} /></div>
            <p className="mt-2 px-1 text-xs text-[#8a8a96]">Slide until the points line up into one smooth wave and the signal peaks. Wrong repeat times leave a messy cloud.</p>
          </section>
          <Calls kind="rv" verdict={verdict} setVerdict={setVerdict} onSubmit={() => verdict && onDone(score(puzzle, verdict, verdict === 'none' ? null : period, helped), verdict)} extra={
            <button type="button" className="pill mt-2 min-h-11 w-full text-xs" onClick={() => { setX(toX(autoPeriodRv(puzzle.t, puzzle.v))); setHelped(true); }}>
              {helped ? 'Auto-search used (−25 points)' : 'Stuck? Auto-search (−25 points)'}
            </button>
          } />
        </>
      )}
    </>
  );
}

/* ---- Flash ---- */
export function MicroView({ puzzle, locked, onDone }: { puzzle: MicroPuzzle; locked: boolean; onDone: Done }) {
  const [smooth, setSmooth] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const series = [{ x: puzzle.t, y: puzzle.f, color: '#a78bfa', size: 2 }, ...(smooth || locked ? [{ x: puzzle.t, y: puzzle.smooth, color: '#ffffff', kind: 'line' as const }] : [])];
  return (
    <>
      <section className="panel rounded-xl p-3" aria-label="Flash of light">
        <div className="eyebrow mb-1 px-1">One star passes in front of another</div>
        <Plot series={series} height={200} xLabel="Days" yLabel="Brightness (×)" ariaLabel="Brightness of the background star as another star drifts in front" />
        <p className="mt-2 px-1 text-xs text-[#8a8a96]">The star brightens and fades once, smoothly. A planet around the lens star adds a short, sharp extra bump. Look for points that leave the smooth shape.</p>
        {locked ? null : <button type="button" aria-pressed={smooth} className="pill mt-2 min-h-11 w-full text-xs" onClick={() => setSmooth((s) => !s)}>{smooth ? 'Hide the smooth curve' : 'Show the smooth curve (what one star alone would do)'}</button>}
      </section>
      {locked ? null : <Calls kind="micro" verdict={verdict} setVerdict={setVerdict} onSubmit={() => verdict && onDone(scoreCall(puzzle.truth.kind, verdict), verdict)} />}
    </>
  );
}

/* ---- Position ---- */
export function AstroView({ puzzle, locked, onDone }: { puzzle: AstroPuzzle; locked: boolean; onDone: Done }) {
  const [join, setJoin] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const R = puzzle.range;
  const order = puzzle.t.map((_, i) => i).sort((a, b) => puzzle.t[a]! - puzzle.t[b]!);
  const series = [
    { x: puzzle.x, y: puzzle.y, color: '#4ade80', size: 2.4 },
    ...(join || locked ? [{ x: order.map((i) => puzzle.x[i]!), y: order.map((i) => puzzle.y[i]!), color: '#4ade80', kind: 'line' as const }] : []),
  ];
  return (
    <>
      <section className="panel rounded-xl p-3" aria-label="Star position">
        <div className="eyebrow mb-1 px-1">Where the star sits in the sky, over 2 years</div>
        <Plot series={series} height={260} xRange={[-R, R]} yRange={[-R, R]} xLabel="Position east–west (milli-arcsec)" yLabel="North–south" ariaLabel="Measured positions of the star on the sky" />
        <p className="mt-2 px-1 text-xs text-[#8a8a96]">Each dot is one measurement. A planet tugs its star around a small loop. Noise just scatters the dots randomly.</p>
        {locked ? null : <button type="button" aria-pressed={join} className="pill mt-2 min-h-11 w-full text-xs" onClick={() => setJoin((s) => !s)}>{join ? 'Hide the joining line' : 'Join the dots in time order'}</button>}
      </section>
      {locked ? null : <Calls kind="astro" verdict={verdict} setVerdict={setVerdict} onSubmit={() => verdict && onDone(scoreCall(puzzle.truth.kind, verdict), verdict)} />}
    </>
  );
}

/* ---- Photo ---- */
export function ImgView({ puzzle, locked, onDone }: { puzzle: ImgPuzzle; locked: boolean; onDone: Done }) {
  const [frame, setFrame] = useState<0 | 1>(0);
  const [tap, setTap] = useState<{ frame: 0 | 1; x: number; y: number } | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    const img = g.createImageData(IMG, IMG);
    const a = puzzle.frames[frame];
    for (let i = 0; i < a.length; i++) {
      const v = Math.min(1, Math.asinh(a[i]! * 3) / Math.asinh(6));
      img.data[i * 4] = 30 + 225 * v;
      img.data[i * 4 + 1] = 30 + 215 * v;
      img.data[i * 4 + 2] = 40 + 200 * v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const ring = (x: number, y: number, col: string) => {
      g.strokeStyle = col;
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(x, y, 6, 0, 2 * Math.PI);
      g.stroke();
    };
    if (tap && tap.frame === frame) ring(tap.x, tap.y, '#fbbf24');
    if (locked && puzzle.planet) ring(puzzle.planet[frame][0], puzzle.planet[frame][1], '#4ade80');
  }, [puzzle, frame, tap, locked]);
  const onTap = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (locked) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTap({ frame, x: ((e.clientX - r.left) / r.width) * IMG, y: ((e.clientY - r.top) / r.height) * IMG });
  };
  return (
    <section className="panel rounded-xl p-3" aria-label="Pictures of the star">
      <div className="eyebrow mb-1 px-1">The star, photographed twice</div>
      <canvas ref={cv} width={IMG} height={IMG} onClick={onTap} role="img" aria-label={`Telescope picture ${frame + 1} of 2. Tap a dot to mark it.`} className="aspect-square w-full touch-manipulation rounded-lg bg-black [image-rendering:pixelated]" />
      <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Which picture">
        {([0, 1] as const).map((f) => (
          <button key={f} type="button" aria-pressed={frame === f} className="pill min-h-11 text-xs" onClick={() => setFrame(f)}>{f === 0 ? 'Picture 1' : 'Picture 2, a year later'}</button>
        ))}
      </div>
      <p className="mt-2 px-1 text-xs text-[#8a8a96]">The bright blob in the middle is the star. Swap between the pictures: a planet orbits, so its dot moves. Far-off background stars stay put. Blotchy glare changes shape.</p>
      {locked ? null : (
        <>
          <p className="mt-2 px-1 text-sm text-white" aria-live="polite">{tap ? 'Dot marked. Swap pictures to check it moved, or tap another.' : 'Tap the dot you think is a planet.'}</p>
          <button type="button" className="pill-primary mt-2 min-h-12 w-full" disabled={!tap} onClick={() => onDone(scoreImaging(puzzle, tap), 'planet')}>Lock in this dot</button>
          <button type="button" className="pill mt-2 min-h-12 w-full" onClick={() => onDone(scoreImaging(puzzle, null), 'none')}>Nothing moved: no planet</button>
        </>
      )}
    </section>
  );
}
