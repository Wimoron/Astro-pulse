'use client';

import { useMemo, useState } from 'react';
import { Plot } from './Plot';
import { Meter } from './methods/ui';
import { autoPeriod, cleaned, dayIndex, foldAt, makePuzzle, rank, score, TIER_NAME, tierForDay, type HuntLog, type Puzzle, type Score, type Tier, type Verdict } from '@/lib/hunt';
import { shareCard } from '@/lib/card';
import { binFolded, oddEven, secondaryEclipse } from '@/lib/physics';
import { streak } from '@/lib/hunt';
import { AstroView, ImgView, MicroView, RvView } from './HuntViews';
import { makeAstro, makeImaging, makeMicro, makeRv, methodForDay, methodForSeed } from '@/lib/huntmore';
import type { Method } from '@/lib/methods';

const LO = 0.8;
const HI = 12;
const toX = (p: number) => Math.round((Math.log(p / LO) / Math.log(HI / LO)) * 1000);
const toP = (x: number) => LO * Math.pow(HI / LO, x / 1000);
const VERDICTS: Array<[Verdict, string, string]> = [
  ['planet', 'A planet', 'Small, shallow, same dip every time'],
  ['binary', 'Two stars', 'Deep dips, alternate dips differ, a second dip halfway'],
  ['none', 'Nothing there', 'Just wobble and flares'],
];

function TransitView({ puzzle, locked, onDone }: { puzzle: Puzzle; locked: boolean; onDone: (s: Score, v: Verdict) => void }) {
  const lc = useMemo(() => cleaned(puzzle.curve), [puzzle]);
  const [x, setX] = useState(() => toX(3));
  const [helped, setHelped] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const period = toP(x);
  const fold = useMemo(() => foldAt(lc, period), [lc, period]);
  const view = useMemo(() => {
    const half = 0.6;
    const pts = fold.dt.map((dt, i) => ({ dt, flux: fold.flux[i]! })).filter((p) => Math.abs(p.dt) <= half);
    const bins = binFolded(pts, 0.02, half);
    return { x: pts.map((p) => p.dt), y: pts.map((p) => p.flux), bx: bins.map((b) => b.dt), by: bins.map((b) => b.flux) };
  }, [fold]);
  const raw = useMemo(() => ({ x: puzzle.curve.time.map((t) => t - puzzle.curve.time[0]!), y: puzzle.curve.flux }), [puzzle]);
  const checks = useMemo(() => {
    const oe = oddEven(lc.time, lc.flux, period, fold.t0, 0.15);
    const sec = secondaryEclipse(lc.time, lc.flux, period, fold.t0, 0.15);
    return { oe, sec };
  }, [lc, period, fold.t0]);

  const nudge = (f: number) => setX(toX(Math.min(HI, Math.max(LO, period * f))));
  const strong = Math.max(0, Math.min(1, (fold.strength - 4) / 14));


  return (
    <>
      <section className="panel rounded-xl p-3" aria-label="Raw brightness">
        <div className="eyebrow mb-1 px-1">The star, 27 days</div>
        <Plot series={[{ x: raw.x, y: raw.y, color: '#8a8a96', size: 1.6 }]} height={190} xLabel="Days" yLabel="Brightness" ariaLabel="Raw brightness of the star over 27 days" />
      </section>

      {locked ? null : (
        <>
                  <section className="panel rounded-xl p-3" aria-label="Fold the data">
            <div className="eyebrow mb-1 px-1">Try a repeat time</div>
            <Plot series={[{ x: view.x, y: view.y, color: '#8a8a96', size: 1.6 }, { x: view.bx, y: view.by, color: '#fbbf24', kind: 'line' }]} height={190} xRange={[-0.6, 0.6]} xLabel="Days from the dip" yLabel="Brightness" ariaLabel={`Data folded every ${period.toFixed(2)} days`} />
            <div className="mt-3 flex items-baseline justify-between px-1">
              <label htmlFor="hunt-p" className="text-sm font-semibold text-white">Repeats every</label>
              <span className="font-mono text-lg text-white">{period.toFixed(3)} days</span>
            </div>
            <input id="hunt-p" type="range" min={0} max={1000} step={1} value={x} onChange={(e) => setX(Number(e.target.value))} aria-label="Repeat time in days" />
            <div className="mt-2 grid grid-cols-4 gap-2">
              {([['−1%', 0.99], ['−0.1%', 0.999], ['+0.1%', 1.001], ['+1%', 1.01]] as const).map(([l, f]) => (
                <button key={l} type="button" className="pill min-h-11 text-xs" onClick={() => nudge(f)}>{l}</button>
              ))}
            </div>
            <div className="mt-3 px-1"><Meter label="Signal" value={strong} good={strong > 0.65} /></div>
            <p className="mt-2 px-1 text-xs text-[#8a8a96]">Slide until the dips pile into one clear notch and the signal peaks. A half or double period also looks good, so check which fits.</p>
          </section>

          <section className="panel rounded-xl p-4" aria-label="Checks">
            <div className="eyebrow">Check for a false alarm</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="cell"><div className="k">Odd vs even dips</div><div className="v">{checks.oe ? (checks.oe.sigma > 3 ? 'Different' : 'Same') : 'n/a'}</div></div>
              <div className="cell"><div className="k">Dip halfway round</div><div className="v">{checks.sec ? (checks.sec.sigma > 3 && checks.sec.depth > 0 ? 'Yes' : 'No') : 'n/a'}</div></div>
            </div>
            <p className="mt-2 text-xs text-[#8a8a96]">Two stars eclipsing each other often show different alternate dips, or a second dip halfway through the orbit. A planet does neither.</p>
          </section>

          <section className="panel rounded-xl p-4" aria-label="Your call">
            <div className="eyebrow">Your call</div>
            <div className="mt-2 grid gap-2" role="group" aria-label="What is it?">
              {VERDICTS.map(([v, t, d]) => (
                <button key={v} type="button" aria-pressed={verdict === v} className="pill min-h-14 flex-col !items-start !justify-center px-4 text-left" onClick={() => setVerdict(v)}>
                  <span className="text-sm font-semibold">{t}</span>
                  <span className="text-xs font-normal opacity-70">{d}</span>
                </button>
              ))}
            </div>
            <button type="button" className="pill-primary mt-3 min-h-12 w-full" disabled={!verdict} onClick={() => verdict && onDone(score(puzzle, verdict, verdict === 'none' ? null : period, helped), verdict)}>Lock in my answer</button>
            <button type="button" className="pill mt-2 min-h-11 w-full text-xs" onClick={() => { setX(toX(autoPeriod(lc))); setHelped(true); }}>
              {helped ? 'Auto-search used (−25 points)' : 'Stuck? Auto-search (−25 points)'}
            </button>
          </section>
        </>
      )}
    </>
  );
}

const METHOD_INFO: Record<Method, { label: string; color: string; blurb: string }> = {
  transit: { label: 'Dimming', color: '#67e8f9', blurb: 'A star seen for 27 days. Is a planet hiding in it? Find the repeat, then make your call.' },
  rv: { label: 'Wobble', color: '#fbbf24', blurb: 'A planet tugs its star back and forth. Does this star wobble on a schedule, and is it a planet?' },
  microlensing: { label: 'Flash', color: '#a78bfa', blurb: 'A star drifted in front of a far one and magnified it. Did a planet add its own bump?' },
  astrometry: { label: 'Position', color: '#4ade80', blurb: 'A planet tugs its star around a tiny loop in the sky. Do these positions make a loop?' },
  imaging: { label: 'Photo', color: '#f472b6', blurb: 'Two telescope pictures of a young star. Is one of the dots a planet?' },
};

export function DailyHunt({ log, onLog }: { log: HuntLog; onLog: (l: HuntLog) => void }) {
  const today = useMemo(() => dayIndex(), []);
  const [practiceSeed, setPracticeSeed] = useState<number | null>(null);
  const seed = practiceSeed ?? today;
  const tier: Tier = practiceSeed === null ? tierForDay(today) : ((practiceSeed % 4) as Tier);
  const method: Method = practiceSeed === null ? methodForDay(today) : methodForSeed(practiceSeed);
  const puzzle = useMemo(() => {
    switch (method) {
      case 'rv': return makeRv(seed, tier);
      case 'microlensing': return makeMicro(seed, tier);
      case 'astrometry': return makeAstro(seed, tier);
      case 'imaging': return makeImaging(seed, tier);
      default: return makePuzzle(seed, tier);
    }
  }, [method, seed, tier]);
  const [result, setResult] = useState<Score | null>(null);
  const done = practiceSeed === null ? log.days[String(today)] : undefined;
  const info = METHOD_INFO[method];

  const onDone = (s: Score, verdict: Verdict) => {
    setResult(s);
    if (practiceSeed === null) onLog({ ...log, days: { ...log.days, [String(today)]: { pts: s.total, verdict } } });
    else onLog({ ...log, practice: log.practice + 1 });
  };
  const again = () => {
    setPracticeSeed(Math.floor(Math.random() * 1e6));
    setResult(null);
  };

  const shown = result ?? (done ? { total: done.pts, verdictPts: 0, periodPts: 0, helpCost: 0, lines: [] } : null);
  const days = streak(log, today);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip" style={{ ['--c' as string]: info.color }}>{practiceSeed === null ? `Today · ${info.label} · ${TIER_NAME[tier]}` : `Practice · ${info.label} · ${TIER_NAME[tier]}`}</span>
        <span className="chip plain" style={{ ['--c' as string]: '#fbbf24' }}>{days} {days === 1 ? "day" : "days"} streak</span>
      </div>
      <div>
        <h1 className="text-[26px] text-white">{puzzle.name}</h1>
        <p className="mt-1 text-[15px] text-[#b4b4be]">{info.blurb}</p>
      </div>

      {method === 'transit' ? <TransitView key={seed} puzzle={puzzle as Puzzle} locked={!!shown} onDone={onDone} /> : null}
      {method === 'rv' ? <RvView key={seed} puzzle={puzzle as ReturnType<typeof makeRv>} locked={!!shown} onDone={onDone} /> : null}
      {method === 'microlensing' ? <MicroView key={seed} puzzle={puzzle as ReturnType<typeof makeMicro>} locked={!!shown} onDone={onDone} /> : null}
      {method === 'astrometry' ? <AstroView key={seed} puzzle={puzzle as ReturnType<typeof makeAstro>} locked={!!shown} onDone={onDone} /> : null}
      {method === 'imaging' ? <ImgView key={seed} puzzle={puzzle as ReturnType<typeof makeImaging>} locked={!!shown} onDone={onDone} /> : null}
      {shown ? (
        <section className="panel rounded-xl p-4" role="status" aria-label="Result">
          <div className="eyebrow">{result ? 'Your result' : 'Done for today'}</div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="font-mono text-5xl text-white">{shown.total}</span>
            <span className="font-heading text-sm font-bold uppercase tracking-[0.1em] text-[#67e8f9]">{rank(shown.total)}</span>
          </div>
          {result ? <ul className="mt-3 space-y-1 text-[15px] text-[#c9c9d2]">{result.lines.map((l) => <li key={l}>{l}</li>)}</ul> : <p className="mt-2 text-[15px] text-[#b4b4be]">A new puzzle arrives tomorrow. Keep the streak going, or practise now.</p>}
          {result ? <p className="mt-3 rounded-lg border border-white/10 bg-[#050506] p-3 text-[15px] text-white">{puzzle.truth.note}</p> : null}
          <button type="button" className="pill-primary mt-4 min-h-12 w-full" onClick={again}>Another practice puzzle</button>
          {result ? <button type="button" className="pill mt-2 min-h-12 w-full" onClick={() => shareCard({ kicker: `${puzzle.name} · ${TIER_NAME[tier]}`, title: `I scored ${result.total}: ${rank(result.total)}`, facts: [['Score', `${result.total} / 100`], ['Streak', `${days} ${days === 1 ? 'day' : 'days'}`]], color: '#67e8f9', footer: 'Daily Hunt · AstroPulse' }, 'astropulse-hunt.png').catch(() => undefined)}>Share my result</button> : null}
        </section>
      ) : null}
    </div>
  );
}
