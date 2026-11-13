'use client';

import { useEffect, useState } from 'react';
import { Candidates } from './Candidates';
import { DailyHunt } from './DailyHunt';
import { loadHunt, saveHunt, type HuntLog } from '@/lib/hunt';
import { loadFindings, saveFindings, type Finding } from '@/lib/candidates';

type Tab = 'today' | 'real';
const TABS: Array<[Tab, string]> = [['today', 'Today'], ['real', 'Real candidates']];

export function Hunt() {
  const [tab, setTab] = useState<Tab>('today');
  const [log, setLog] = useState<HuntLog>({ days: {}, practice: 0 });
  const [findings, setFindings] = useState<Finding[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading saved progress once on load
    setLog(loadHunt());
    setFindings(loadFindings());
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
      <div role="tablist" aria-label="Hunt" className="mb-5 grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-[#0a0a0d] p-1">
        {TABS.map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-11 rounded-md px-2 font-heading text-[11px] font-bold uppercase tracking-[0.08em] ${tab === t ? 'bg-white text-[#050506]' : 'text-[#b4b4be]'}`}>
            {label}
          </button>
        ))}
      </div>
      {!ready ? null : tab === 'today' ? <DailyHunt log={log} onLog={onLog} /> : <Candidates findings={findings} onCall={(f) => onFindings([f, ...findings.filter((x) => x.toi !== f.toi)])} />}
    </div>
  );
}
