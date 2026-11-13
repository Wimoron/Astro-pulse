'use client';

import { useMemo, useState } from 'react';
import type { HostRec } from '@/lib/hosts';
import { METHODS, type Method } from '@/lib/methods';

type Key = 'n' | 'y' | 'd' | 'p' | 'r' | 'mj' | 'np';
const COLS: Array<{ k: Key; label: string; right?: boolean }> = [
  { k: 'n', label: 'Star' },
  { k: 'y', label: 'Found', right: true },
  { k: 'd', label: 'Distance (ly)', right: true },
  { k: 'p', label: 'Orbit (days)', right: true },
  { k: 'r', label: 'Size (Earths)', right: true },
  { k: 'mj', label: 'Mass (Jupiters)', right: true },
  { k: 'np', label: 'Planets', right: true },
];

export interface CatalogStatus {
  source: 'live' | 'saved' | 'sample';
  updated: number;
  error?: string;
}

const fmt = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? '–' : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : String(Math.round(v * 10 ** d) / 10 ** d));

export function Catalog(p: {
  hosts: HostRec[];
  fresh: Set<string>;
  status: CatalogStatus;
  refreshing: boolean;
  onRefresh: () => void;
  canOpen: (h: HostRec) => boolean;
  onOpen: (h: HostRec) => void;
}) {
  const [q, setQ] = useState('');
  const [method, setMethod] = useState<'all' | Method | 'other'>('all');
  const [since, setSince] = useState(0);
  const [near, setNear] = useState(0);
  const [onlyNew, setOnlyNew] = useState(false);
  const [sort, setSort] = useState<{ k: Key; dir: 1 | -1 }>({ k: 'y', dir: -1 });
  const [shown, setShown] = useState(60);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const r = p.hosts.filter((h) => (method === 'all' || h.t === method) && (!since || h.y >= since) && (!near || (h.d !== null && h.d <= near)) && (!onlyNew || p.fresh.has(h.n)) && (!t || h.n.toLowerCase().includes(t) || h.pl.toLowerCase().includes(t)));
    return r.sort((a, b) => {
      const x = sort.k === 'n' ? a.n : (a[sort.k] as number | null | undefined) ?? null;
      const y = sort.k === 'n' ? b.n : (b[sort.k] as number | null | undefined) ?? null;
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [p.hosts, p.fresh, q, method, since, near, onlyNew, sort]);

  const years = useMemo(() => {
    const ys = p.hosts.map((h) => h.y).filter(Boolean);
    return Math.max(...ys, new Date().getFullYear());
  }, [p.hosts]);

  const exportCsv = () => {
    const head = 'star,planet,method,year,distance_ly,orbit_days,radius_earth,mass_jupiter,star_mass_sun,ra_deg,dec_deg,planets_in_system';
    const body = rows.map((h) => [JSON.stringify(h.n), h.pl, h.om ?? h.t, h.y, h.d ?? '', h.p ?? '', h.r ?? '', h.mj ?? '', h.sm ?? '', h.ra, h.dec, h.np ?? ''].join(','));
    const url = URL.createObjectURL(new Blob([[head, ...body].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'astropulse-stars.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const sel = 'min-h-12 rounded-lg border border-white/15 bg-[#0a0a0d] px-3 text-sm text-white focus:border-white focus:outline-none';
  const when = p.status.updated ? new Date(p.status.updated).toLocaleString() : '';
  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-5 md:px-8 md:pb-24 md:pt-6">
      <div className="eyebrow flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${p.status.source === 'live' ? 'bg-emerald-500' : 'bg-[#fbbf24]'}`} />NASA Exoplanet Archive · {p.status.source === 'live' ? 'live' : 'saved copy'}</div>
      <h1 className="mt-1 text-2xl text-white md:text-5xl">Every known planet host.</h1>
      <p className="mt-2 hidden max-w-2xl text-[#c9d5ee] sm:block">
        {p.status.source === 'live' ? 'Live from the NASA Exoplanet Archive' : p.status.source === 'saved' ? 'Saved copy of the NASA Exoplanet Archive' : 'Small built-in sample (NASA could not be reached)'}
        {when ? `, updated ${when}` : ''}.{p.status.error ? ` Reason: ${p.status.error}.` : ''} Search, filter, sort, then open a star to study it.
      </p>

      <div className="glass mt-4 rounded-xl p-3 md:mt-6 md:p-4"><div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,200px))]">
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown(60); }} placeholder={`Search ${p.hosts.length.toLocaleString()} stars…`} aria-label="Search stars" className={`${sel} col-span-2 w-full placeholder:text-[#8da0c4] md:col-span-1`} />
        <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className={sel} aria-label="Method">
          <option value="all">All methods</option>
          {(Object.keys(METHODS) as Method[]).map((m) => (<option key={m} value={m}>{METHODS[m].short}: {METHODS[m].name.split(' (')[0]}</option>))}
          <option value="other">Other methods</option>
        </select>
        <select value={since} onChange={(e) => setSince(Number(e.target.value))} className={sel} aria-label="Found since">
          <option value={0}>Any year</option>
          {[years, years - 1, years - 4, years - 9, 2015].filter((v, i, a) => a.indexOf(v) === i).map((y) => (<option key={y} value={y}>Found {y} or later</option>))}
        </select>
        <select value={near} onChange={(e) => setNear(Number(e.target.value))} className={sel} aria-label="Distance">
          <option value={0}>Any distance</option>
          <option value={50}>Within 50 light-years</option>
          <option value={200}>Within 200 light-years</option>
          <option value={1000}>Within 1,000 light-years</option>
        </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
        <div className="text-sm text-[#c9d5ee]">Showing <b className="text-white">{Math.min(shown, rows.length).toLocaleString()}</b> of {rows.length.toLocaleString()} stars</div>
        <div className="flex flex-wrap gap-2">
        {p.fresh.size ? (
          <button type="button" className="pill min-h-11 px-4 text-sm font-semibold" aria-pressed={onlyNew} onClick={() => setOnlyNew((v) => !v)}>New since your last visit ({p.fresh.size})</button>
        ) : null}
        <button type="button" className="pill min-h-11 px-4 text-sm font-semibold" onClick={p.onRefresh} disabled={p.refreshing}>{p.refreshing ? 'Updating…' : 'Update from NASA'}</button>
        <button type="button" className="pill min-h-11 px-4 text-sm font-semibold" onClick={exportCsv}>Download CSV ({rows.length.toLocaleString()})</button>
        </div>
        </div></div>

      <ul className="mt-4 grid gap-3 md:hidden" aria-label="Stars">
        {rows.slice(0, shown).map((h) => (
          <li key={`m-${h.n}-${h.pl}`} className="panel rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-heading text-xl font-bold text-white">{h.n} <span className="font-medium text-[#8a8a96]">{h.pl}</span></div>
                <div className="mt-1 font-mono text-xs text-[#8a8a96]">{h.y || '–'} · {fmt(h.d, 0)} ly · {fmt(h.p)} d orbit{p.fresh.has(h.n) ? ' · NEW' : ''}</div>
              </div>
              {h.t === 'other' ? <span className="chip plain shrink-0" style={{ ['--c' as string]: '#b4b4be' }}>{h.om ?? 'Other'}</span> : <span className="chip shrink-0" style={{ ['--c' as string]: METHODS[h.t].color }}>{METHODS[h.t].short}</span>}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="cell"><div className="k">Size</div><div className="v !text-[13px]">{h.r != null ? `${fmt(h.r)} R⊕` : h.mj != null ? (h.mj < 0.1 ? `${fmt(h.mj * 317.8)} M⊕` : `${fmt(h.mj)} Mj`) : '–'}</div></div>
              <div className="cell"><div className="k">Orbit</div><div className="v !text-[13px]">{h.p != null ? `${fmt(h.p)} d` : '–'}</div></div>
              <div className="cell"><div className="k">Planets</div><div className="v !text-[13px]">{h.np ?? '–'}</div></div>
            </div>
            <div className="mt-3">{p.canOpen(h) ? <button type="button" className="pill-primary min-h-12 w-full" onClick={() => p.onOpen(h)}>Open lab →</button> : <div className="grid min-h-12 w-full place-items-center rounded-lg border border-dashed border-white/20 font-heading text-xs font-bold uppercase tracking-[0.1em] text-[#8a8a96]">No lab yet</div>}</div>
          </li>
        ))}
        {rows.length === 0 ? <li className="p-6 text-center text-[#c9d5ee]">No star matches. Try fewer filters.</li> : null}
        {rows.length > shown ? <li><button type="button" className="pill min-h-12 w-full" onClick={() => setShown((n) => n + 60)}>Load more ({Math.min(shown, rows.length)} of {rows.length.toLocaleString()})</button></li> : null}
      </ul>

      <div className="glass mt-4 hidden overflow-x-auto rounded-xl md:block">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[#9fb0d4]">
              {COLS.map((c) => (
                <th key={c.k} scope="col" className={`p-3 font-medium ${c.right ? 'text-right' : ''}`} aria-sort={sort.k === c.k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="font-medium hover:text-white" onClick={() => setSort((s) => ({ k: c.k, dir: s.k === c.k ? (s.dir === 1 ? -1 : 1) : c.k === 'n' ? 1 : -1 }))}>
                    {c.label}{sort.k === c.k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
              ))}
              <th scope="col" className="p-3 font-medium">Found by</th>
              <th scope="col" className="p-3"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((h) => (
              <tr key={`${h.n}-${h.pl}`} className="border-b border-white/5 hover:bg-white/[0.04]">
                <td className="p-3 font-semibold text-white">
                  {h.n} <span className="font-normal text-[#9fb0d4]">{h.pl}</span>
                  {p.fresh.has(h.n) ? <span className="ml-2 rounded-full bg-[#67e8f9] px-2 py-0.5 text-[10px] font-bold text-[#04202a]">NEW</span> : null}
                </td>
                <td className="p-3 text-right font-mono">{h.y || '–'}</td>
                <td className="p-3 text-right font-mono">{fmt(h.d, 1)}</td>
                <td className="p-3 text-right font-mono">{fmt(h.p)}</td>
                <td className="p-3 text-right font-mono">{fmt(h.r, 1)}</td>
                <td className="p-3 text-right font-mono">{fmt(h.mj, 3)}</td>
                <td className="p-3 text-right font-mono">{h.np ?? 1}</td>
                <td className="p-3">
                  {h.t === 'other' ? <span className="text-[#c9d5ee]">{h.om ?? 'Other'}</span> : <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-[#04202a]" style={{ background: METHODS[h.t].color }}>{METHODS[h.t].short}</span>}
                </td>
                <td className="p-3 text-right">
                  {p.canOpen(h) ? <button type="button" className="pill min-h-10 px-4 text-sm font-semibold" onClick={() => p.onOpen(h)}>Open →</button> : <span className="text-xs text-[#8da0c4]">No lab yet</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="p-6 text-center text-[#c9d5ee]">No star matches. Try fewer filters.</p> : null}
      </div>
      {rows.length > shown ? (
        <div className="mt-4 hidden text-center md:block"><button type="button" className="pill min-h-11 px-6 font-semibold" onClick={() => setShown((s) => s + 100)}>Show 100 more ({(rows.length - shown).toLocaleString()} left)</button></div>
      ) : null}
    </div>
  );
}
