'use client';

import { useEffect, useState } from 'react';
import { CreditsText, PrivacyText } from './LegalText';
import type { Mode } from './Lab';
import { APP_NAME, DEVELOPER, PLAY_URL, REPO_URL, SUPPORT_EMAIL, VERSION } from '@/lib/app';
import { dayIndex, loadHunt, streak, type HuntLog } from '@/lib/hunt';
import { loadDispositions, loadFindings, saveFindings, serverReady, verdictOf, type Finding } from '@/lib/candidates';
import { METHODS } from '@/lib/methods';
import { API, NO_SERVER } from '@/lib/api';
import { loadReminder, reminderSupported, setReminder, clearReminder, type Reminder } from '@/lib/reminder';
import { badges, loadCollection, standing, xpOf, type Discovery } from '@/lib/progress';

export type MePage = 'main' | 'privacy' | 'credits';

const KEYS = ['ap-reminder-v1', 'ap-hunt-v1', 'ap-findings-v1', 'ap-collection-v1', 'ap-last-v1', 'ap-skyhint'];

function Row({ title, hint, onClick }: { title: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center justify-between gap-3 border-t border-white/10 px-1 py-2 text-left first:border-t-0">
      <span>
        <span className="block text-[15px] font-semibold text-white">{title}</span>
        {hint ? <span className="block text-xs text-[#8a8a96]">{hint}</span> : null}
      </span>
      <span aria-hidden="true" className="text-[#8a8a96]">›</span>
    </button>
  );
}

export function Me({ mode, setMode, onUpload, page, setPage, onIntro }: { mode: Mode; setMode: (m: Mode) => void; onUpload: () => void; page: MePage; setPage: (p: MePage) => void; onIntro: () => void }) {
  const [log, setLog] = useState<HuntLog>({ days: {}, practice: 0 });
  const [findings, setFindings] = useState<Finding[]>([]);
  const [col, setCol] = useState<Discovery[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [net, setNet] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [rem, setRem] = useState<Reminder>({ on: false, hour: 18, minute: 0 });
  const [canRemind, setCanRemind] = useState(false);
  const [remNote, setRemNote] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading saved settings once on load
    setRem(loadReminder());
    reminderSupported().then(setCanRemind);
  }, []);
  const applyRem = async (next: Reminder) => {
    const r = await setReminder(next);
    if (r.ok) {
      setRem(next);
      setRemNote(next.on ? `Reminder set for ${String(next.hour).padStart(2, '0')}:${String(next.minute).padStart(2, '0')} every day.` : 'Reminder off.');
    } else setRemNote(r.message ?? 'Could not set the reminder.');
  };

  const load = () => {
    setLog(loadHunt());
    setFindings(loadFindings());
    setCol(loadCollection());
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reading saved progress once on load
  useEffect(load, []);

  const today = dayIndex();
  const days = Object.values(log.days);
  const best = days.reduce((m, d) => Math.max(m, d.pts), 0);
  const avg = days.length ? Math.round(days.reduce((s, d) => s + d.pts, 0) / days.length) : 0;
  const ruled = findings.filter((f) => verdictOf(f) !== null);
  const right = ruled.filter((f) => verdictOf(f) === 'right').length;
  const open = findings.filter((f) => verdictOf(f) === null);
  const st = standing(xpOf(col, log, findings));
  const bs = badges(col, log, findings);

  const check = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const s = await loadDispositions(open.map((f) => f.toi));
      const next = findings.map((f) => (s[f.toi] ? { ...f, nasa: s[f.toi] } : f));
      setFindings(next);
      saveFindings(next);
      const n = next.filter((f) => verdictOf(f) !== null).length - ruled.length;
      setMsg(n > 0 ? `NASA ruled on ${n} more of your calls.` : 'NASA has not ruled on any more yet. Check back later.');
    } catch (e) {
      setMsg(`NASA could not be reached: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const testNet = async () => {
    setTesting(true);
    setNet(null);
    try {
      const t0 = Date.now();
      const r = await fetch(`${API}/api/catalog`, { signal: AbortSignal.timeout(60000) });
      const j = (await r.json().catch(() => null)) as { hosts?: unknown[]; source?: string; error?: string } | null;
      if (!r.ok) setNet(`The server answered ${r.status}${j?.error ? `: ${j.error}` : ''}.`);
      else setNet(`Connected in ${((Date.now() - t0) / 1000).toFixed(1)} s. ${Array.isArray(j?.hosts) ? j.hosts.length.toLocaleString() : '?'} stars received.`);
    } catch (e) {
      setNet(`Could not reach ${API || 'the server'}: ${(e as Error).message}. Check the address, the internet connection, and that the website is deployed.`);
    } finally {
      setTesting(false);
    }
  };

  const reset = () => {
    try {
      KEYS.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* blocked storage: nothing to clear */
    }
    void clearReminder();
    setRem({ on: false, hour: 18, minute: 0 });
    load();
    setSure(false);
    setNote('Your progress was erased from this phone.');
  };

  const shareApp = async () => {
    const data = { title: APP_NAME, text: 'Learn how astronomers find planets, then hunt real ones in NASA data.', url: PLAY_URL };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(PLAY_URL);
        setNote('Link copied.');
      }
    } catch {
      /* closed the share sheet */
    }
  };

  if (page !== 'main') {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pb-10 pt-4">
        <button type="button" onClick={() => setPage('main')} className="flex min-h-11 items-center gap-2 font-heading text-xs font-bold uppercase tracking-[0.1em] text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" /></svg>Back
        </button>
        <h1 className="mt-2 text-[26px] text-white">{page === 'privacy' ? 'Privacy policy' : 'Credits and data sources'}</h1>
        {page === 'privacy' ? <PrivacyText /> : <CreditsText />}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-10 pt-4">
      <h1 className="text-[26px] text-white">Me</h1>

      <section className="panel rounded-xl p-4" aria-label="Rank">
        <div className="eyebrow">Your rank</div>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <span className="font-heading text-2xl font-extrabold text-white">{st.rank}</span>
          <span className="font-mono text-sm text-[#b4b4be]">{st.xp} XP</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="meter" aria-label="Progress to next rank" aria-valuenow={Math.round(st.pct * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-[#67e8f9]" style={{ width: `${Math.max(3, st.pct * 100)}%` }} />
        </div>
        <p className="mt-2 text-xs text-[#8a8a96]">{st.next ? `${st.toNext} XP to ${st.next}.` : 'Top rank reached.'} You earn XP for planets found in labs, daily hunt scores and real candidate calls.</p>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <div className="cell"><div className="k">Streak</div><div className="v">{streak(log, today)} {streak(log, today) === 1 ? 'day' : 'days'}</div></div>
        <div className="cell"><div className="k">Hunts played</div><div className="v">{days.length}</div></div>
        <div className="cell"><div className="k">Best score</div><div className="v">{best}</div></div>
        <div className="cell"><div className="k">Average</div><div className="v">{avg}</div></div>
      </div>

      <section className="panel rounded-xl p-4" aria-label="Streak calendar">
        <div className="flex items-center justify-between"><span className="eyebrow">Last 4 weeks</span><span className="text-xs text-[#8a8a96]">{streak(log, today)} day streak</span></div>
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {Array.from({ length: 28 }, (_, i) => today - 27 + i).map((d) => (
            <div key={d} aria-label={log.days[String(d)] ? `Played, score ${log.days[String(d)]!.pts}` : 'Not played'} className={`grid h-8 place-items-center rounded-md border text-[10px] ${log.days[String(d)] ? 'border-[#ffaa46]/50 bg-[#ffaa46]/15 text-[#ffaa46]' : d === today ? 'border-white/60 text-white' : 'border-white/10 text-[#5b5b65]'}`}>{new Date(d * 86400000).getUTCDate()}</div>
          ))}
        </div>
      </section>

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
        {col.length === 0 ? (
          <p className="mt-2 text-[15px] text-[#b4b4be]">None yet. Finish a lab and the planet lands here.</p>
        ) : (
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
          <p className="mt-2 text-[15px] text-[#b4b4be]">None yet. Open Hunt → Real candidates and call one.</p>
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

      <section className="panel rounded-xl p-4" aria-label="Settings">
        <div className="eyebrow">Settings</div>
        <div className="mt-3 text-sm font-semibold text-white" id="explain-lbl">How much detail?</div>
        <div role="group" aria-labelledby="explain-lbl" className="mt-2 grid grid-cols-2 gap-2">
          {(['beginner', 'expert'] as Mode[]).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className="pill min-h-12 capitalize">{m}</button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[#8a8a96]">Beginner explains every step in plain words. Expert shows the numbers.</p>
        <div className="mt-3">
          <Row title="Use my own data" hint="Open a CSV light curve from your phone" onClick={onUpload} />
          <Row title="Replay the intro" onClick={onIntro} />
          <Row title="Share AstroPulse" onClick={shareApp} />
          <Row title="Rate on Google Play" onClick={() => window.open(PLAY_URL, '_blank', 'noopener')} />
        </div>
      </section>

      {canRemind ? (
        <section className="panel rounded-xl p-4" aria-label="Daily reminder">
          <div className="eyebrow">Daily reminder</div>
          <p className="mt-2 text-[15px] text-[#c9c9d2]">One quiet nudge a day when the new puzzle is ready. Stays on this phone.</p>
          <div className="mt-3 flex items-center gap-3">
            <label htmlFor="rem-t" className="text-sm font-semibold text-white">Time</label>
            <input id="rem-t" type="time" className="min-h-11 rounded-lg border border-white/15 bg-[#050506] px-3 font-mono text-white" value={`${String(rem.hour).padStart(2, '0')}:${String(rem.minute).padStart(2, '0')}`} onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); if (Number.isFinite(h) && Number.isFinite(m)) { const next = { ...rem, hour: h!, minute: m! }; if (rem.on) void applyRem(next); else setRem(next); } }} />
          </div>
          <button type="button" aria-pressed={rem.on} className={`${rem.on ? 'pill' : 'pill-primary'} mt-3 min-h-12 w-full`} onClick={() => applyRem({ ...rem, on: !rem.on })}>{rem.on ? 'Turn reminder off' : 'Remind me daily'}</button>
          {remNote ? <p className="mt-2 text-sm text-[#b4b4be]" role="status">{remNote}</p> : null}
        </section>
      ) : null}

      <section className="panel rounded-xl p-4" aria-label="NASA connection">
        <div className="eyebrow">NASA connection</div>
        <p className="mt-2 text-[15px] text-[#c9c9d2]">{NO_SERVER ? 'This app was built without a data server address, so it uses its built-in sample of stars.' : `Data server: ${API || 'this website'}`}</p>
        {NO_SERVER ? null : <button type="button" className="pill mt-3 min-h-12 w-full" disabled={testing} onClick={testNet}>{testing ? 'Testing…' : 'Test connection'}</button>}
        {net ? <p className="mt-2 text-sm text-[#b4b4be]" role="status">{net}</p> : null}
      </section>

      <section className="panel rounded-xl p-4" aria-label="About">
        <div className="eyebrow">About</div>
        <div className="mt-3">
          <Row title="Privacy policy" onClick={() => setPage('privacy')} />
          <Row title="Credits and data sources" onClick={() => setPage('credits')} />
          <Row title="Contact" hint={SUPPORT_EMAIL} onClick={() => window.open(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`${APP_NAME} ${VERSION}`)}`)} />
          <Row title="Open source code" hint={REPO_URL.replace('https://', '')} onClick={() => window.open(REPO_URL, '_blank', 'noopener')} />
        </div>
        <p className="mt-3 text-xs text-[#8a8a96]">{APP_NAME} {VERSION} · by {DEVELOPER}</p>
      </section>

      <section className="panel rounded-xl p-4" aria-label="Your data">
        <div className="eyebrow">Your data</div>
        <p className="mt-2 text-[15px] text-[#b4b4be]">Everything above is saved on this phone only. No account needed.</p>
        {sure ? (
          <div className="mt-3 grid grid-cols-2 gap-2" role="alertdialog" aria-label="Erase progress?">
            <button type="button" className="pill min-h-12" onClick={() => setSure(false)}>Keep it</button>
            <button type="button" className="pill-primary min-h-12 !bg-[#f87171]" onClick={reset}>Erase</button>
          </div>
        ) : (
          <button type="button" className="pill mt-3 min-h-12 w-full" onClick={() => setSure(true)}>Reset my progress</button>
        )}
        {note ? <p className="mt-2 text-sm text-[#b4b4be]" role="status">{note}</p> : null}
      </section>
    </div>
  );
}
