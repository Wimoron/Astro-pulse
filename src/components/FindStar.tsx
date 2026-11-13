'use client';

import { API } from '@/lib/api';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SkyTarget } from '@/lib/catalog';

interface Hit { name: string; ra: number; dec: number; mag: number | null; tic: string | null; note: string }

const EXAMPLES = ['TIC 261136679', 'TOI-700', 'WASP-121', 'Kepler-90'];

export function customTarget(h: Hit): SkyTarget {
  return {
    id: `custom-${h.name.replace(/\W+/g, '').toLowerCase()}-${h.ra.toFixed(2)}`,
    name: h.name,
    constellation: '',
    ra: h.ra,
    dec: h.dec,
    magnitude: h.mag ?? 12,
    mission: 'Catalog',
    method: 'transit',
    tagline: 'A star you looked up. We check NASA for real TESS or Kepler data.',
    story: 'You picked this star yourself. If NASA has watched it, you will get its real brightness record. Nobody has pre-marked the answer, so you may find a planet or nothing at all.',
    difficulty: 'hard',
    star: { radiusSun: 1, massSun: 1, teffK: 5700 },
    known: { kind: 'planet', periodDays: 0, depthPpm: 0, note: '' },
    standIn: null,
    custom: true,
  };
}

/** Look up any star by name, TIC number or TOI number and study it on real data. */
export function FindStar({ local, onPickLocal, onPick, onClose }: { local: SkyTarget[]; onPickLocal: (t: SkyTarget) => void; onPick: (t: SkyTarget) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const near = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return local.filter((t) => t.name.toLowerCase().includes(s)).slice(0, 5);
  }, [q, local]);

  const search = async (text: string) => {
    const s = text.trim();
    if (s.length < 2) return;
    setBusy(true);
    setErr('');
    setHits(null);
    try {
      const r = await fetch(`${API}/api/resolve?q=${encodeURIComponent(s)}`, { signal: AbortSignal.timeout(30000) });
      const j = (await r.json()) as { results?: Hit[]; error?: string };
      if (!r.ok) setErr(j.error ?? 'The lookup failed.');
      else if (!j.results?.length) setErr('No star found with that name. Try a TIC number (like TIC 261136679) or a catalog name (like WASP-121).');
      else setHits(j.results);
    } catch {
      setErr('Could not reach the lookup service. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 pt-[10vh]" role="dialog" aria-modal="true" aria-labelledby="find-title" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel w-full max-w-lg rounded-xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow">Any star in the sky</div>
            <h2 id="find-title" className="mt-1 text-2xl text-white">Find a star</h2>
          </div>
          <button type="button" onClick={onClose} className="pill min-h-10 px-3" aria-label="Close">Close</button>
        </div>
        <p className="mt-2 text-sm text-[#b4b4be]">Type a star name, a TIC number or a TOI number. We fetch its real brightness record from NASA, if it has one.</p>
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void search(q); }}>
          <label className="sr-only" htmlFor="find-q">Star name, TIC or TOI</label>
          <input id="find-q" ref={input} value={q} onChange={(e) => { setQ(e.target.value); setHits(null); setErr(''); }} placeholder="e.g. TOI-700, TIC 261136679, WASP-121" className="min-h-11 flex-1 rounded-lg border border-white/22 bg-transparent px-3 text-base text-white placeholder:text-[#6b6b76]" maxLength={60} autoComplete="off" />
          <button type="submit" className="pill-primary min-h-11 px-5" disabled={busy || q.trim().length < 2}>{busy ? 'Looking…' : 'Look up'}</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((x) => (
            <button key={x} type="button" className="pill min-h-9 px-3 !text-[11px]" onClick={() => { setQ(x); void search(x); }}>{x}</button>
          ))}
        </div>
        {near.length ? (
          <div className="mt-5">
            <div className="eyebrow">Already in the catalog</div>
            <ul className="mt-2 divide-y divide-white/10 rounded-lg border border-white/10">
              {near.map((t) => (
                <li key={t.id}><button type="button" onClick={() => onPickLocal(t)} className="flex min-h-11 w-full items-center justify-between px-3 text-left text-sm text-white hover:bg-white/5"><span>{t.name}</span><span className="eyebrow">{t.method}</span></button></li>
              ))}
            </ul>
          </div>
        ) : null}
        {hits ? (
          <div className="mt-5" role="status">
            <div className="eyebrow">Found</div>
            <ul className="mt-2 divide-y divide-white/10 rounded-lg border border-white/10">
              {hits.map((h) => (
                <li key={`${h.name}-${h.ra}`}>
                  <button type="button" onClick={() => onPick(customTarget(h))} className="flex min-h-12 w-full items-center justify-between gap-3 px-3 text-left hover:bg-white/5">
                    <span><span className="block text-sm font-semibold text-white">{h.name}</span><span className="eyebrow">{h.note}{h.mag !== null ? ` · mag ${h.mag.toFixed(1)}` : ''}</span></span>
                    <span className="text-sm text-white">Study →</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {err ? <p className="mt-4 text-sm text-[#fca5a5]" role="alert">{err}</p> : null}
      </div>
    </div>
  );
}
