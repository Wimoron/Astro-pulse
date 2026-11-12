'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plot } from './Plot';
import { loadRealCurve } from '@/lib/live';
import { loadCandidates, readCandidate, serverReady, type Call, type Candidate, type Finding } from '@/lib/candidates';
import { dayIndex } from '@/lib/hunt';
import { rng } from '@/lib/simulate';
import { binFolded } from '@/lib/physics';
import type { LightCurve } from '@/lib/types';

function shuffled<T>(xs: T[], seed: number): T[] {
  const r = rng(seed);
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function Candidates({ findings, onCall }: { findings: Finding[]; onCall: (f: Finding) => void }) {
  const [list, setList] = useState<Candidate[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [got, setGot] = useState<{ toi: string; c: LightCurve | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!serverReady) return;
    loadCandidates().then(setList).catch((e: Error) => setErr(e.message));
  }, []);

  const called = useMemo(() => new Set(findings.map((f) => f.toi)), [findings]);
  const queue = useMemo(() => (list ? shuffled(list, dayIndex()) : []), [list]);
  const cand = queue.find((c) => !called.has(c.toi) && !skipped.includes(c.toi)) ?? null;
  const left = queue.filter((c) => !called.has(c.toi) && !skipped.includes(c.toi)).length;

  useEffect(() => {
    if (!cand) return;
    let live = true;
    loadRealCurve(cand.ra, cand.dec).then((c) => live && setGot({ toi: cand.toi, c }));
    return () => {
      live = false;
    };
  }, [cand?.toi]); // eslint-disable-line react-hooks/exhaustive-deps

  const curve: LightCurve | null | 'loading' = cand && got && got.toi === cand.toi ? got.c : 'loading';
  const reading = useMemo(() => (cand && curve && curve !== 'loading' ? readCandidate(curve, cand) : null), [cand, curve]);
  const folded = useMemo(() => {
    if (!reading) return null;
    const half = Math.max(reading.durationDays * 4, 0.3);
    const pts = reading.fold.dt.map((dt, i) => ({ dt, flux: reading.fold.flux[i]! }));
    const bins = binFolded(pts, Math.max(0.01, half / 30), half);
    return { half, x: reading.fold.dt, y: reading.fold.flux, bx: bins.map((b) => b.dt), by: bins.map((b) => b.flux) };
  }, [reading]);

  if (!serverReady) {
    return (
      <div className="panel rounded-xl p-4 text-[15px] text-[#b4b4be]">
        <h2 className="text-xl text-white">Real candidates need the NASA connection</h2>
        <p className="mt-2">This build of the app has no data server set up, so it cannot fetch live TESS data. The daily hunt still works. See ANDROID.md to switch the live connection on.</p>
      </div>
    );
  }
  if (err) return <div className="panel rounded-xl p-4 text-[15px] text-[#fecaca]" role="alert">NASA could not be reached: {err}. Try again in a minute.</div>;
  if (!list) return <div className="panel rounded-xl p-4 text-[15px] text-[#b4b4be]" role="status">Loading NASA’s list of unconfirmed planets…</div>;
  if (!cand) return <div className="panel rounded-xl p-4 text-[15px] text-[#b4b4be]" role="status">You have called every bright candidate on the list. New ones arrive as NASA adds them. Check My log for NASA’s answers.</div>;

  const call = (c: Call) => {
    onCall({ toi: cand.toi, call: c, at: Date.now() });
    setToast(`TOI-${cand.toi} saved as ${c === 'planet' ? 'a planet' : 'a false alarm'}. NASA has not ruled yet; My log shows if you were right once it does.`);
  };

  return (
    <div className="flex flex-col gap-4">
      {toast ? <p className="rounded-lg border border-[#4ade80]/40 bg-[#0d2418] p-3 text-sm text-[#d1fae5]" role="status">{toast}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip" style={{ ['--c' as string]: '#a78bfa' }}>Real · unconfirmed</span>
        <span className="chip plain" style={{ ['--c' as string]: '#8a8a96' }}>{left} left</span>
      </div>
      <div>
        <h1 className="text-[26px] text-white">TOI-{cand.toi}</h1>
        <p className="mt-1 text-[15px] text-[#b4b4be]">NASA’s TESS telescope saw this star dim on a schedule. Nobody has confirmed a planet yet. Is it real?</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="cell"><div className="k">Repeats</div><div className="v">{cand.periodDays.toFixed(2)} d</div></div>
        <div className="cell"><div className="k">Dip</div><div className="v">{Math.round(cand.depthPpm / 100) / 100}%</div></div>
        <div className="cell"><div className="k">Size</div><div className="v">{cand.radiusEarth ? `${cand.radiusEarth.toFixed(1)} R⊕` : 'n/a'}</div></div>
      </div>

      {curve === 'loading' ? <div className="panel rounded-xl p-4 text-[15px] text-[#b4b4be]" role="status">Fetching the real TESS data… this can take up to a minute.</div> : null}
      {curve === null ? (
        <div className="panel rounded-xl p-4" role="status">
          <p className="text-[15px] text-[#b4b4be]">No readable TESS data for this star right now.</p>
          <button type="button" className="pill-primary mt-3 min-h-12 w-full" onClick={() => setSkipped((s) => [...s, cand.toi])}>Next candidate</button>
        </div>
      ) : null}

      {curve && curve !== 'loading' ? (
        <>
          <section className="panel rounded-xl p-3" aria-label="Real brightness">
            <div className="eyebrow mb-1 px-1">Real TESS brightness</div>
            <Plot series={[{ x: curve.time, y: curve.flux, color: '#8a8a96', size: 1.4 }]} height={180} xLabel="Days" yLabel="Brightness" ariaLabel="Real TESS brightness of this star" />
          </section>
          {reading && folded ? (
            <>
              <section className="panel rounded-xl p-3" aria-label="Folded">
                <div className="eyebrow mb-1 px-1">Folded every {reading.period.toFixed(3)} days</div>
                <Plot series={[{ x: folded.x, y: folded.y, color: '#8a8a96', size: 1.4 }, { x: folded.bx, y: folded.by, color: '#a78bfa', kind: 'line' }]} height={180} xRange={[-folded.half, folded.half]} xLabel="Days from the dip" yLabel="Brightness" ariaLabel="Data folded at the candidate’s period" />
              </section>
              <section className="panel rounded-xl p-4" aria-label="Our reading">
                <div className="eyebrow">What the data says</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="cell"><div className="k">Dip strength</div><div className="v">{reading.snr.toFixed(1)}×</div></div>
                  <div className="cell"><div className="k">Dip depth</div><div className="v">{Math.round(reading.depth * 1e6).toLocaleString()} ppm</div></div>
                  <div className="cell"><div className="k">Odd vs even</div><div className="v">{reading.oddEvenSigma === null ? 'n/a' : reading.oddEvenSigma > 3 ? 'Different' : 'Same'}</div></div>
                  <div className="cell"><div className="k">Halfway dip</div><div className="v">{reading.secondarySigma === null ? 'n/a' : reading.secondarySigma > 3 ? 'Yes' : 'No'}</div></div>
                </div>
                <ul className="mt-3 space-y-1 text-[15px] text-[#c9c9d2]">{reading.flags.map((f) => <li key={f}>{f}</li>)}</ul>
              </section>
            </>
          ) : (
            <div className="panel rounded-xl p-4 text-[15px] text-[#b4b4be]" role="status">This data is too short to measure. Skip to the next one.</div>
          )}

          <section className="panel rounded-xl p-4" aria-label="Your call">
            <div className="eyebrow">Your call</div>
            <div className="mt-2 grid gap-2">
              <button type="button" className="pill-primary min-h-12" onClick={() => call('planet')}>Looks like a planet</button>
              <button type="button" className="pill min-h-12" onClick={() => call('false')}>Looks like a false alarm</button>
              <button type="button" className="pill min-h-11 text-xs" onClick={() => setSkipped((s) => [...s, cand.toi])}>Skip</button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
