'use client';

import { useEffect, useState } from 'react';
import { dayIndex, loadHunt, streak, type HuntLog } from '@/lib/hunt';
import { loadFindings } from '@/lib/candidates';
import { loadCollection, standing, xpOf } from '@/lib/progress';
import { METHODS, type Method } from '@/lib/methods';

export interface LastOpened {
  id: string;
  name: string;
  method: Method;
}

type Props = {
  last: LastOpened | null;
  onContinue: () => void;
  onPractice: (m: Method) => void;
  onSky: () => void;
  onCatalog: () => void;
  onHunt: () => void;
  onMe: () => void;
  counts: Record<Method, number>;
  total: number;
  status: { source: 'live' | 'saved' | 'sample'; updated: number; fresh: number; error?: string } | null;
};

export function Home(p: Props) {
  const [log, setLog] = useState<HuntLog>({ days: {}, practice: 0 });
  const [xp, setXp] = useState(0);
  useEffect(() => {
    const l = loadHunt();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading saved progress once on load
    setLog(l);
    setXp(xpOf(loadCollection(), l, loadFindings()));
  }, []);
  const today = dayIndex();
  const done = log.days[String(today)];
  const days = streak(log, today);
  const st = standing(xp);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = today - 6 + i;
    return { day: d, letter: 'SMTWTFS'[new Date(d * 86400000).getUTCDay()]!, done: !!log.days[String(d)], today: d === today };
  });

  return (
    <div className="flex min-h-full flex-col">
      <h1 className="sr-only">AstroPulse home</h1>
      <section className="relative flex min-h-full flex-1 flex-col items-center justify-between overflow-hidden px-6 pb-6 pt-4 text-center" aria-label="Today">
        <div aria-hidden="true" className="home-glow" />
        <button type="button" onClick={p.onMe} className="relative z-10 flex min-h-11 items-center gap-2 self-stretch text-left">
          <span className="chip plain" style={{ ['--c' as string]: '#b4b4be' }}>{st.rank}</span>
          {days > 0 ? <span className="chip plain" style={{ ['--c' as string]: '#fbbf24' }}>{days} day streak</span> : null}
          <span className="ml-auto font-mono text-xs text-[#8a8a96]">{xp} XP</span>
        </button>

        <div className="relative z-10 flex flex-col items-center">
          <svg viewBox="0 0 240 200" className="h-48 w-60" role="img" aria-label="A planet crossing in front of a star. The star dims a little as it passes.">
            <defs>
              <radialGradient id="hs-star" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fff7e0" />
                <stop offset="55%" stopColor="#ffd27a" />
                <stop offset="100%" stopColor="#ff9f43" stopOpacity="0" />
              </radialGradient>
            </defs>
            <ellipse cx="120" cy="100" rx="112" ry="26" fill="none" stroke="#ffffff" strokeOpacity="0.12" strokeDasharray="3 5" />
            <g className="hs-star"><circle cx="120" cy="100" r="78" fill="url(#hs-star)" /><circle cx="120" cy="100" r="42" fill="#ffe9b0" /></g>
            <circle className="hs-planet" cx="120" cy="100" r="13" fill="#050506" stroke="#67e8f9" strokeWidth="1.5" />
          </svg>
          <p className="mt-2 font-heading text-[34px] font-extrabold leading-[1.05] text-white">Catch a hidden planet</p>
          <p className="mt-3 max-w-[18rem] text-[17px] text-[#b4b4be]">{done ? `You scored ${done.pts} today. A new star arrives tomorrow.` : 'A new star every day. One minute.'}</p>
        </div>

        <div className="relative z-10 mt-8 w-full max-w-sm">
          <div className="mb-4 grid grid-cols-7 gap-1.5" role="list" aria-label="Last 7 days">
            {week.map((w) => (
              <div key={w.day} role="listitem" aria-label={`${w.letter}: ${w.done ? 'played' : w.today ? 'today' : 'not played'}`} className="flex flex-col items-center gap-1 text-[10px] text-[#8a8a96]">
                <span aria-hidden="true" className={`grid aspect-square w-full max-w-9 place-items-center rounded-full border-[1.5px] text-[13px] ${w.done ? 'border-[#ffaa46]/60 bg-[#ffaa46]/15 text-[#ffaa46]' : w.today ? 'border-white shadow-[0_0_0_3px_rgba(255,255,255,.08)]' : 'border-white/15'}`}>{w.done ? '✦' : ''}</span>
                {w.letter}
              </div>
            ))}
          </div>
          <button type="button" className="pill-primary min-h-14 w-full text-base" onClick={p.onHunt}>{done ? 'Practise more' : 'Play today’s hunt'}</button>
          <button type="button" onClick={p.onMe} className="panel mt-3 block w-full rounded-xl p-3 text-left" aria-label={`Rank ${st.rank}, ${xp} XP. Open progress`}>
            <span className="flex items-baseline justify-between"><span className="text-[13px] font-bold text-white">{st.rank}</span><span className="font-mono text-xs text-[#8a8a96]">{xp} XP</span></span>
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-gradient-to-r from-[#ffaa46] to-[#fbbf24]" style={{ width: `${Math.max(3, st.pct * 100)}%` }} /></span>
          </button>
          {p.last ? (
            <button type="button" onClick={p.onContinue} className="mt-2 min-h-11 w-full text-sm font-semibold text-[#b4b4be]">Continue {p.last.name} →</button>
          ) : (
            <p className="mt-2 flex min-h-11 items-center justify-center text-sm text-[#8a8a96]">Swipe up to explore</p>
          )}
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 pb-8 pt-6" aria-label="Explore">
        <div className="eyebrow mb-3">Five ways to find planets</div>
        <div className="hide-scroll -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
          {(Object.keys(METHODS) as Method[]).map((m) => (
            <button key={m} type="button" onClick={() => p.onPractice(m)} className="panel w-40 shrink-0 snap-start rounded-xl p-4 text-left" style={{ ['--c' as string]: METHODS[m].color }}>
              <span aria-hidden="true" className="block h-2 w-2 rounded-full" style={{ background: METHODS[m].color }} />
              <span className="mt-2 block text-[17px] font-semibold text-white">{METHODS[m].short}</span>
              <span className="mt-1 line-clamp-3 block text-xs text-[#8a8a96]">{METHODS[m].oneLine}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button type="button" onClick={p.onSky} className="panel min-h-14 rounded-xl px-4 text-left text-[15px] font-semibold text-white">Sky map</button>
          <button type="button" onClick={p.onCatalog} className="panel min-h-14 rounded-xl px-4 text-left text-[15px] font-semibold text-white">All planets</button>
        </div>
        {p.status ? (
          <p className="mt-4 text-center text-[11px] text-[#8a8a96]" role="status">
            {p.status.source === 'live' ? 'Live from NASA' : p.status.source === 'saved' ? 'Saved NASA copy' : 'Built-in sample of stars'}
            {p.status.error ? ` · NASA could not be reached: ${p.status.error}` : ''}
          </p>
        ) : null}
      </section>
    </div>
  );
}
