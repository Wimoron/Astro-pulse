'use client';

import { useEffect, useState } from 'react';
import { Candidates } from './Candidates';
import { DailyHunt } from './DailyHunt';
import { dayIndex, loadHunt, saveHunt, streak, type HuntLog } from '@/lib/hunt';
import { badges, loadCollection, standing, xpOf, type Discovery } from '@/lib/progress';
import { METHODS } from '@/lib/methods';
import { loadDispositions, loadFindings, saveFindings, serverReady, verdictOf, type Finding } from '@/lib/candidates';

type Tab = 'today' | 'real' | 'log';
const TABS: Array<[Tab, string]> = [['today', 'Today'], ['real', 'Real candidates'], ['log', 'My log']];

function Log({ log, findings, onFindings, col }: { log: HuntLog; findings: Finding[]; onFindings: (f: Finding[]) => void; col: Discovery[] }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const today = dayIndex();
  const days = Object.entries(log.days);
  const best = days.reduce((m, [, d]) => Math.max(m, d.pts), 0);
  const avg = days.length ? Math.round(days.reduce((s, [, d]) => s + d.pts, 0) / days.length) : 0;
  const ruled = findings.filter((f) => verdictOf(f) !== null);
  const right = ruled.filter((f) => verdictOf(f) === 'right').length;
  const open = findings.filter((f) => verdictOf(f) === null);
  const st = standing(xpOf(col, log, findings));
  const bs = badges(col, log, findings);

  const check = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const st = await loadDispositions(open.map((f) => f.toi));
      const next = findings.map((f) => (st[f.toi] ? { ...f, nasa: st[f.toi] } : f));
      onFindings(next);
      const n = next.filter((f) => verdictOf(f) !== null).length - ruled.length;
      setMsg(n > 0 ? `NASA ruled on ${n} more of your calls.` : 'NASA has not ruled on any more yet. Check back later.');
    } catch (e) {
      setMsg(`NASA could not be reached: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[26px] text-white">My log</h1>
        <p className="mt-1 text-[15px] text-[#b4b4be]">Your daily scores and your calls on real candidates. Saved on this phone.</p>
      </div>
      <section className="panel rounded-xl p-4" aria-label="Rank">
        <div className="eyebrow">Your rank</div>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <span className="font-heading text-2xl font-extrabold text-white">{st.rank}</span>
          <span className="font-mono text-sm text-[#b4b4be]">{st.xp} XP</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="meter" aria-label="Progress to next rank" aria-valuenow={Math.round(st.pct * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-[#67e8f9]" style={{ width: `${Math.max(3, st.pct * 100)}%` }} />
        </div>
        <p className="mt-2 text-xs text-[#8a8a96]">{st.next ? `${st.toNext} XP to ${st.next}.` : 'Top rank reached.'} XP: 25 per planet found in a lab, your score in each daily hunt, 10 per real candidate.</p>
      </section>
      <div className="grid grid-cols-2 gap-2">
        <div className="cell"><div className="k">Streak</div><div className="v">{streak(log, today)} {streak(log, today) === 1 ? "day" : "days"}</div></div>
        <div className="cell"><div className="k">Hunts played</div><div className="v">{days.length}</div></div>
        <div className="cell"><div className="k">Best score</div><div className="v">{best}</div></div>
        <div className="cell"><div className="k">Average</div><div className="v">{avg}</div></div>
      </div>

      <section className="panel rounded-xl p-4" aria-label="Badges">
        <div className="eyebrow">Badges · {bs.filter((b) => b.got).length} of {bs.length}</div>
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {bs.map((b) => (
            <li key={b.id} className={`cell ${b.got ? '' : 'opacity-45'}`}>
              <div className="k">{b.got ? 'Earned' : 'Locked'}</div>
              <div className="mt-1 text-sm font-semibold text-white">{b.label}</div>
              <div className="text-xs text-[#8a8a96]">{b.how}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel rounded-xl p-4" aria-label="Collection">
        <div className="eyebrow">Planets you found · {col.length}</div>
        {col.length === 0 ? <p className="mt-2 text-[15px] text-[#b4b4be]">None yet. Finish a lab and the planet lands here.</p> : (
          <ul className="mt-2 divide-y divide-white/10">
            {col.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate font-semibold text-white">{d.name}</span>
                <span className="chip plain shrink-0" style={{ ['--c' as string]: METHODS[d.method].color }}>{METHODS[d.method].short}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel rounded-xl p-4" aria-label="Real candidates">
        <div className="eyebrow">Real candidates you called</div>
        {findings.length === 0 ? (
          <p className="mt-2 text-[15px] text-[#b4b4be]">None yet. Open Real candidates and call one.</p>
        ) : (
          <>
            <p className="mt-2 text-[15px] text-white">{ruled.length ? `NASA has ruled on ${ruled.length}: you were right on ${right}.` : `${findings.length} called, waiting for NASA.`}</p>
            <ul className="mt-3 divide-y divide-white/10">
              {findings.map((f) => {
                const v = verdictOf(f);
                return (
                  <li key={f.toi} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="font-mono text-white">TOI-{f.toi}</span>
                    <span className="text-[#b4b4be]">{f.call === 'planet' ? 'You: planet' : 'You: false alarm'}</span>
                    <span className={`font-semibold ${v === 'right' ? 'text-[#4ade80]' : v === 'wrong' ? 'text-[#f87171]' : 'text-[#8a8a96]'}`}>{v === 'right' ? 'Right' : v === 'wrong' ? 'Wrong' : 'Open'}</span>
                  </li>
                );
              })}
            </ul>
            {serverReady && open.length ? <button type="button" className="pill mt-3 min-h-11 w-full" disabled={busy} onClick={check}>{busy ? 'Asking NASA…' : 'Check NASA’s answers'}</button> : null}
            {msg ? <p className="mt-2 text-sm text-[#b4b4be]" role="status">{msg}</p> : null}
          </>
        )}
      </section>
    </div>
  );
}

export function Hunt() {
  const [tab, setTab] = useState<Tab>('today');
  const [log, setLog] = useState<HuntLog>({ days: {}, practice: 0 });
  const [findings, setFindings] = useState<Finding[]>([]);
  const [col, setCol] = useState<Discovery[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading saved progress once on load
    setLog(loadHunt());
    setFindings(loadFindings());
    setCol(loadCollection());
    setReady(true);
  }, []);

  const onLog = (l: HuntLog) => {
    setLog(l);
    saveHunt(l);
  };
  const onFindings = (f: Finding[]) => {
    setFindings(f);
    saveFindings(f);
  };

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-8 pt-4">
      <div role="tablist" aria-label="Hunt" className="mb-5 grid grid-cols-3 gap-1 rounded-lg border border-white/10 bg-[#0a0a0d] p-1">
        {TABS.map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-11 rounded-md px-2 font-heading text-[11px] font-bold uppercase tracking-[0.08em] ${tab === t ? 'bg-white text-[#050506]' : 'text-[#b4b4be]'}`}>
            {label}
          </button>
        ))}
      </div>
      {!ready ? null : tab === 'today' ? <DailyHunt log={log} onLog={onLog} /> : tab === 'real' ? <Candidates findings={findings} onCall={(f) => onFindings([f, ...findings.filter((x) => x.toi !== f.toi)])} /> : <Log log={log} findings={findings} onFindings={onFindings} col={col} />}
    </div>
  );
}
