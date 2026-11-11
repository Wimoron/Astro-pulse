'use client';
/* eslint-disable react-hooks/set-state-in-effect -- restoring from a share link on first load is a deliberate effect */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SKY_TARGETS, standInCurve, toTarget, type SkyTarget } from '@/lib/catalog';
import { parseLightCurveCsv } from '@/lib/csv';
import type { LightCurve, Target } from '@/lib/types';
import { hostId, hostToTarget, labReady, type HostRec } from '@/lib/hosts';
import { loadCatalog, loadRealCurve, type CatalogState } from '@/lib/live';
import { Catalog } from './Catalog';
import { Tonight } from './Tonight';
import { type Method } from '@/lib/methods';
import { Lab, type LabState, type Mode } from './Lab';
import { FindStar } from './FindStar';
import { Learn } from './Learn';
import { MethodLab } from './MethodLab';
import { SkyView, type ConstellationRec, type StarRec } from './SkyView';
import { TelescopeView } from './TelescopeView';

type View = 'learn' | 'sky' | 'catalog' | 'tonight' | 'scope' | 'lab' | 'method';

const FEATURED_NAMES = new Set(['HD 209458', 'WASP-18', 'Pi Mensae', 'Kepler-10', 'Kepler-186']);
const PRACTICE_START: Record<Exclude<Method, 'transit'>, string> = { rv: '51 Pegasi', imaging: 'Beta Pictoris', microlensing: 'OGLE-2003-BLG-235', astrometry: 'Practice star Q' };

function readHash(): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof window === 'undefined') return out;
  for (const part of window.location.hash.replace(/^#/, '').split('&')) {
    const [k, v] = part.split('=');
    if (k && v !== undefined) out[k] = decodeURIComponent(v);
  }
  return out;
}

export default function App() {
  const [mode, setMode] = useState<Mode>('beginner');
  const [view, setView] = useState<View>('learn');
  const [catalog, setCatalog] = useState<CatalogState | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const tried = useRef<Set<string>>(new Set());
  const hostsDone = catalog !== null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stars, setStars] = useState<StarRec[]>([]);
  const [cons, setCons] = useState<ConstellationRec[]>([]);
  const [skyErr, setSkyErr] = useState<string | null>(null);
  const [realCurves, setRealCurves] = useState<Record<string, LightCurve>>({});
  const [extra, setExtra] = useState<SkyTarget[]>([]);
  const [noData, setNoData] = useState<Set<string>>(new Set());
  const [finding, setFinding] = useState(false);
  const [menu, setMenu] = useState(false);
  const [uploaded, setUploaded] = useState<Target | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);
  const [labInit, setLabInit] = useState<Partial<LabState>>({});
  const labState = useRef<LabState | null>(null);
  const [labTick, setLabTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sky catalog.
  useEffect(() => {
    Promise.all([fetch('sky/stars.json').then((r) => r.json()), fetch('sky/constellations.json').then((r) => r.json())])
      .then(([s, c]) => {
        setStars(s as StarRec[]);
        setCons(c as ConstellationRec[]);
      })
      .catch(() => setSkyErr('Could not load the star map.'));
  }, []);

  // Every known planet host: live from NASA when possible.
  useEffect(() => {
    loadCatalog().then(setCatalog);
  }, []);
  const refresh = () => {
    setRefreshing(true);
    loadCatalog(true).then(setCatalog).finally(() => setRefreshing(false));
  };
  const hosts = useMemo(() => (catalog ? catalog.hosts.filter((h) => !FEATURED_NAMES.has(h.n) && h.t !== 'other').map((h) => hostToTarget(h as HostRec & { t: Method })).filter(labReady) : []), [catalog]);
  const fresh = useMemo(() => new Set(catalog?.fresh ?? []), [catalog]);

  const all = useMemo(() => [...SKY_TARGETS, ...hosts, ...extra], [hosts, extra]);

  // Restore from a share link.
  useEffect(() => {
    if (!hostsDone) return;
    const h = readHash();
    if (h.m === 'expert') setMode('expert');
    if (h.t && all.some((t) => t.id === h.t)) {
      setSelectedId(h.t);
      setLabInit({ w: Number(h.w) || undefined, o: Number(h.o) || undefined, c: Number(h.c) || undefined, p: Number(h.p) || 0, s: Number(h.s) || 0 });
      if (h.v === 'lab' || h.v === 'scope' || h.v === 'method' || h.v === 'sky') setView(h.v);
    } else if (h.v === 'sky' || h.v === 'learn') setView(h.v);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostsDone]);

  const onLabState = useCallback((s: LabState) => {
    labState.current = s;
    setLabTick((x) => x + 1);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const parts = [`v=${view}`, selectedId && `t=${encodeURIComponent(selectedId)}`, `m=${mode}`];
    if (view === 'lab' && labState.current) {
      const s = labState.current;
      parts.push(`w=${s.w}`, `o=${s.o}`, `c=${s.c}`, `p=${s.p}`, `s=${s.s}`);
    }
    window.history.replaceState(null, '', `#${parts.filter(Boolean).join('&')}`);
  }, [ready, view, selectedId, mode, labTick]);

  const sky = all.find((t) => t.id === selectedId) ?? null;
  const counts = useMemo(() => {
    const c: Record<Method, number> = { transit: 0, rv: 0, imaging: 0, microlensing: 0, astrometry: 0 };
    (catalog?.hosts ?? []).forEach((h) => {
      if (h.t !== 'other') c[h.t] += 1;
    });
    return c;
  }, [catalog]);
  const siblings = useMemo(() => (sky ? all.filter((t) => t.method === sky.method && t.method !== 'transit') : []), [all, sky]);
  const practice = (m: Method) => {
    if (m === 'transit') {
      setSelectedId('hd209458');
      setView('scope');
      return;
    }
    const t = all.find((x) => x.method === m && x.name === PRACTICE_START[m]) ?? all.find((x) => x.method === m);
    if (t) {
      setSelectedId(t.id);
      setView('method');
    }
  };
  const isReal = !!(sky && realCurves[sky.id]);
  const standIn = useMemo<LightCurve | null>(() => (sky && sky.method === 'transit' ? standInCurve(sky) : null), [sky]);
  const curve = sky ? (realCurves[sky.id] ?? (sky.custom ? null : standIn)) : null;
  const labTarget = useMemo<Target | null>(() => {
    if (uploaded && !sky) return uploaded;
    return sky && curve ? toTarget(sky, curve, isReal) : null;
  }, [sky, curve, isReal, uploaded]);

  // Ask the server for real TESS or Kepler data for the star you picked.
  useEffect(() => {
    if (!sky || sky.method !== 'transit' || realCurves[sky.id] || tried.current.has(sky.id)) return;
    tried.current.add(sky.id);
    setChecking(sky.id);
    loadRealCurve(sky.ra, sky.dec)
      .then((c) => {
        if (c) setRealCurves((m) => ({ ...m, [sky.id]: c }));
        else if (sky.custom) setNoData((n) => new Set(n).add(sky.id));
      })
      .finally(() => setChecking((id) => (id === sky.id ? null : id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sky]);

  const realIds = useMemo(() => new Set(Object.keys(realCurves)), [realCurves]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* the address bar already holds the link */
    }
  };

  const onUpload = async (f: File | undefined) => {
    if (!f) return;
    try {
      const c = parseLightCurveCsv(await f.text());
      setUploaded({
        id: `upload-${Date.now()}`,
        name: f.name,
        kind: 'upload',
        source: 'Your file',
        blurb: `${c.time.length.toLocaleString()} points from your CSV.`,
        difficulty: 'medium',
        star: { radiusSun: 1, massSun: 1, teffK: 5772 },
        curve: c,
      });
      setUploadErr(null);
      setSelectedId(null);
      setLabInit({});
      setView('lab');
    } catch (e) {
      setUploadErr((e as Error).message);
    }
  };

  const isTransit = !sky || sky.method === 'transit';
  const go = (v: View) => {
    if (v === 'sky' || v === 'learn' || v === 'catalog' || v === 'tonight') setView(v);
    else if (v === 'lab' && sky && !isTransit) setView('method');
    else if (sky) setView(v);
  };

  const canOpenHost = (h: HostRec) => all.some((t) => t.id === hostId(h)) || FEATURED_NAMES.has(h.n);
  const openHost = (h: HostRec) => {
    const t = all.find((x) => x.id === hostId(h)) ?? SKY_TARGETS.find((x) => x.name === h.n);
    if (t) {
      setSelectedId(t.id);
      setView(t.method === 'transit' ? 'scope' : 'method');
    }
  };

  const nav: Array<[View, string]> = [
    ['learn', 'Learn'],
    ['sky', 'Sky'],
    ['catalog', 'Catalog'],
    ['tonight', 'Tonight'],
    ['scope', 'Telescope'],
    ['lab', 'Lab'],
  ];

  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="glass-bar relative z-20 flex shrink-0 items-center gap-x-3 gap-y-2 px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] md:px-5">
        <button type="button" onClick={() => setView('learn')} className="mr-3 font-[family-name:var(--font-heading)] text-[15px] font-extrabold uppercase leading-none tracking-[0.2em] text-white" aria-label="AstroPulse, home">
          Astro<span className="text-[#ff7a45]">Pulse</span>
        </button>
        <nav aria-label="Where you are" className="hide-scroll hidden max-w-full gap-1 overflow-x-auto md:flex">
          {nav.map(([v, label]) => {
            const disabled = (v === 'scope' || v === 'lab') && (!sky || (v === 'scope' && !isTransit));
            const current = view === v || (v === 'lab' && view === 'method');
            return (
              <button
                key={v}
                type="button"
                disabled={disabled}
                aria-current={current ? 'page' : undefined}
                onClick={() => go(v)}
                className={`min-h-10 px-3.5 pill disabled:opacity-30`}
              >
                {label}
              </button>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:hidden">
          <button type="button" onClick={() => setFinding(true)} className="min-h-10 pill bg-[#1c1c22] px-3.5 font-heading text-[11px] font-bold uppercase tracking-[0.1em]">Find a star</button>
          <button type="button" onClick={() => setMenu(true)} className="min-h-10 min-w-10 pill px-3" aria-label="More options" aria-haspopup="dialog">⋯</button>
        </div>
        <div className="ml-auto hidden flex-wrap items-center gap-2 md:flex">
          <div role="group" aria-label="Difficulty of explanations" className="flex overflow-hidden rounded-lg border border-white/22">
            {(['beginner', 'expert'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`min-h-10 px-3.5 pill !rounded-none !border-0 ${mode === m ? '' : 'hover:bg-white/10'}`}
              >
                {m}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setFinding(true)} className="min-h-10 pill px-3.5">Find a star</button>
          <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={(e) => onUpload(e.target.files?.[0])} />
          <button type="button" onClick={() => fileRef.current?.click()} className="min-h-10 pill px-3.5">
            <span className="sm:hidden">Upload</span>
            <span className="hidden sm:inline">Use my own data</span>
          </button>
          <button type="button" onClick={share} className="min-h-10 pill px-3.5">
            {copied ? 'Copied' : 'Share'}
          </button>
        </div>
      </header>
      {finding ? <FindStar local={all.filter((t) => !t.custom)} onClose={() => setFinding(false)} onPickLocal={(t) => { setFinding(false); setSelectedId(t.id); setView(t.method === 'transit' ? 'scope' : 'method'); }} onPick={(t) => { setExtra((e) => (e.some((x) => x.id === t.id) ? e : [...e, t])); setFinding(false); setSelectedId(t.id); setView('scope'); }} /> : null}
      {uploadErr ? (
        <p className="border-b border-[#f87171] bg-[#2a1313] px-4 py-2 text-sm text-[#fecaca]" role="alert">
          {uploadErr} Use a CSV with a time column (days) and a flux column, at least 200 rows.
        </p>
      ) : null}

      <main className="min-h-0 flex-1">
        {view === 'learn' && (
          <div className="h-full overflow-y-auto">
            <Learn onPractice={practice} onSky={() => setView('sky')} onCatalog={() => setView('catalog')} counts={counts} total={catalog?.hosts.length ?? 0} status={catalog ? { source: catalog.source, updated: catalog.updated, fresh: catalog.fresh.length, error: catalog.error } : null} />
          </div>
        )}
        {view === 'catalog' && catalog && (
          <div className="h-full overflow-y-auto">
            <Catalog
              hosts={catalog.hosts}
              fresh={fresh}
              status={{ source: catalog.source, updated: catalog.updated, error: catalog.error }}
              refreshing={refreshing}
              onRefresh={refresh}
              canOpen={canOpenHost}
              onOpen={openHost}
            />
          </div>
        )}
        {view === 'tonight' && catalog && (
          <div className="h-full overflow-y-auto">
            <Tonight hosts={catalog.hosts} live={catalog.source !== 'sample'} canOpen={canOpenHost} onOpen={openHost} />
          </div>
        )}
        {view === 'method' && sky && sky.method !== 'transit' && (
          <div className="h-full overflow-y-auto">
            <MethodLab target={sky} siblings={siblings} onPick={setSelectedId} onBack={() => setView('learn')} />
          </div>
        )}
        {view === 'sky' && (
          <div className="relative h-full">
            {stars.length === 0 && !skyErr ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#03060d] text-lg text-[#c5d1ea]" role="status">Loading the sky…</div> : null}
            {skyErr ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#03060d] text-lg text-[#fecaca]" role="alert">{skyErr}</div> : null}
            <SkyView stars={stars} constellations={cons} selectedId={selectedId} onSelect={setSelectedId} onOpenTelescope={(id) => { setSelectedId(id); setView('scope'); }} onStudy={(id) => { setSelectedId(id); setView('method'); }} realIds={realIds} checking={checking} targets={all} featured={SKY_TARGETS} />
          </div>
        )}
        {view === 'scope' && sky && sky.custom && noData.has(sky.id) ? (
          <div className="mx-auto max-w-md px-4 py-16 text-center" role="alert">
            <h2 className="text-2xl text-white">No TESS or Kepler data for {sky.name}</h2>
            <p className="mt-3 text-sm text-[#b4b4be]">NASA has not recorded this star’s brightness in a way we can read, or the data service is busy. Try another star.</p>
            <button type="button" className="pill-primary mt-6 min-h-12 px-6" onClick={() => setFinding(true)}>Find another star</button>
          </div>
        ) : null}
        {view === 'scope' && sky && !(sky.custom && noData.has(sky.id)) && (
          <TelescopeView key={sky.id} target={sky} curve={curve} real={isReal} stars={stars} onBack={() => setView('sky')} onOpenLab={() => { setLabInit({}); setView('lab'); }} />
        )}
        {view === 'lab' && labTarget && (
          <div className="h-full overflow-y-auto">
            <Lab
              key={`${labTarget.id}-${isReal}`}
              target={labTarget}
              mode={mode}
              initial={labInit}
              onState={onLabState}
              onBack={() => (sky ? setView('scope') : setView('sky'))}
              onShare={share}
              copied={copied}
            />
          </div>
        )}
      </main>
      <nav aria-label="Main" className="glass-bar relative z-20 grid shrink-0 grid-cols-5 border-t border-white/10 pb-[env(safe-area-inset-bottom)] md:hidden">
        {([['learn', 'Learn', 'M12 3 2 8l10 5 10-5-10-5Zm-6 9v4c0 1.5 2.7 3 6 3s6-1.5 6-3v-4'], ['sky', 'Sky', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4 1.5 3.5L17 12l-3.5 1.5L12 17l-1.5-3.5L7 12l3.5-1.5L12 7Z'], ['catalog', 'Catalog', 'M4 6h16M4 12h16M4 18h16'], ['tonight', 'Tonight', 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z'], ['study', 'Study', 'M3 19 9 5l3 8 3-4 6 10H3Z']] as const).map(([v, label, d]) => {
          const current = v === 'study' ? view === 'scope' || view === 'lab' || view === 'method' : view === v;
          return (
            <button key={v} type="button" aria-current={current ? 'page' : undefined} onClick={() => (v === 'study' ? (sky ? setView(isTransit ? 'scope' : 'method') : setView('sky')) : go(v))} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${current ? 'text-white' : 'text-[#8a8a96]'}`}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={current ? 2.2 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
              {label}
            </button>
          );
        })}
      </nav>
      {menu ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 md:hidden" role="dialog" aria-modal="true" aria-label="More options" onClick={(e) => e.target === e.currentTarget && setMenu(false)}>
          <div className="panel w-full rounded-t-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <div className="eyebrow">Explanations</div>
            <div role="group" aria-label="Difficulty of explanations" className="mt-2 grid grid-cols-2 gap-2">
              {(['beginner', 'expert'] as Mode[]).map((m) => (<button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className="pill min-h-12">{m}</button>))}
            </div>
            <div className="mt-4 grid gap-2">
              <button type="button" className="pill min-h-12" onClick={() => { setMenu(false); fileRef.current?.click(); }}>Use my own data</button>
              <button type="button" className="pill min-h-12" onClick={() => { share(); setMenu(false); }}>{copied ? 'Link copied' : 'Share this view'}</button>
              <button type="button" className="pill min-h-12" onClick={() => setMenu(false)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
