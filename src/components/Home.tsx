'use client';

import { useEffect, useState } from 'react';
import { Learn } from './Learn';
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

  return (
    <div>
      <h1 className="sr-only">AstroPulse home</h1>
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 pt-4">
        <button type="button" onClick={p.onMe} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-left">
          <span className="min-w-0">
            <span className="eyebrow block">Welcome</span>
            <span className="block whitespace-nowrap font-heading text-xl font-extrabold text-white">{st.rank}</span>
          </span>
          <span className="flex items-center gap-2 whitespace-nowrap">
            {days > 0 ? <span className="chip plain" style={{ ['--c' as string]: '#fbbf24' }}>{days} day streak</span> : null}
            <span className="font-mono text-sm text-[#b4b4be]">{xp} XP</span>
          </span>
        </button>

        <section className="panel rounded-xl p-4" aria-label="Today's hunt">
          <div className="flex items-center justify-between">
            <span className="eyebrow">Today’s hunt</span>
            <span className="chip" style={{ ['--c' as string]: done ? '#4ade80' : '#67e8f9' }}>{done ? `Done · ${done.pts}` : 'New'}</span>
          </div>
          <h2 className="mt-2 text-xl text-white">{done ? 'Nice work. Come back tomorrow.' : 'Is there a planet in this star?'}</h2>
          <p className="mt-1 text-[15px] text-[#b4b4be]">{done ? 'Want more? Practise on as many extra puzzles as you like.' : 'One new puzzle a day. Two minutes. Find the repeat, make your call, get scored.'}</p>
          <button type="button" className="pill-primary mt-3 min-h-12 w-full" onClick={p.onHunt}>{done ? 'Practise more' : 'Play today’s hunt'}</button>
        </section>

        {p.last ? (
          <button type="button" onClick={p.onContinue} className="panel flex min-h-16 items-center justify-between gap-3 rounded-xl p-4 text-left" style={{ ['--c' as string]: METHODS[p.last.method].color }}>
            <span className="min-w-0">
              <span className="eyebrow block">Continue</span>
              <span className="block truncate text-[17px] font-semibold text-white">{p.last.name}</span>
              <span className="block text-xs text-[#8a8a96]">{METHODS[p.last.method].short} method</span>
            </span>
            <span aria-hidden="true" className="text-xl text-white">→</span>
          </button>
        ) : (
          <section className="panel rounded-xl p-4" aria-label="Start here">
            <span className="chip plain !bg-white !text-[#050506] !border-white">Start here</span>
            <h2 className="mt-2 text-xl text-white">Watch a star dim as a planet crosses it</h2>
            <p className="mt-1 text-[15px] text-[#b4b4be]">The easiest way to find a planet. You will measure a real one in about ten minutes.</p>
            <button type="button" className="pill-primary mt-3 min-h-12 w-full" onClick={() => p.onPractice('transit')}>Start the first lab</button>
          </section>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={p.onSky} className="panel min-h-24 rounded-xl p-4 text-left">
            <span className="block text-[17px] font-semibold text-white">Sky map</span>
            <span className="mt-1 block text-xs text-[#8a8a96]">Tap a star to see its planets</span>
          </button>
          <button type="button" onClick={p.onCatalog} className="panel min-h-24 rounded-xl p-4 text-left">
            <span className="block text-[17px] font-semibold text-white">All planets</span>
            <span className="mt-1 block text-xs text-[#8a8a96]">{p.total ? `${p.total.toLocaleString()} known stars with planets` : 'Browse and search'}</span>
          </button>
        </div>

        {p.status ? (
          <p className="text-center text-[11px] text-[#8a8a96]" role="status">
            {p.status.source === 'live' ? 'Live from NASA' : p.status.source === 'saved' ? 'Saved NASA copy' : 'Built-in sample of stars'}
            {p.status.error ? ` · NASA could not be reached: ${p.status.error}` : ''}
          </p>
        ) : null}
      </div>
      <div className="mt-6">
        <Learn dash onPractice={p.onPractice} onSky={p.onSky} onCatalog={p.onCatalog} onHunt={p.onHunt} counts={p.counts} total={p.total} status={p.status} />
      </div>
    </div>
  );
}
