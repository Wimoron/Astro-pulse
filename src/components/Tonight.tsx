'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from 'react';
import { azimuth, compass, GEAR, icsFor, jdOf, moonLit, nextNight, nextTransits, observability, passDuring, PLACES, type GearId, type Night, type TransitEvent } from '@/lib/astro';
import type { HostRec } from '@/lib/hosts';
import { METHODS } from '@/lib/methods';

const KEY = 'ap-place-v1';
interface Place { name: string; lat: number; lon: number }

const tz = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'your time zone'; }
})();
const clock = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dayName = (d: Date) => d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

/** Depth of a transit in parts per thousand, from the planet and star sizes. */
export function depthPpt(h: HostRec): number | null {
  const sr = h.sr ?? (h.sm ? (h.sm > 1 ? h.sm ** 0.8 : h.sm ** 0.9) : null);
  const rE = h.r ?? (h.mj ? Math.max(1, 11 * Math.sqrt(h.mj)) : null);
  if (!sr || !rE) return null;
  return ((rE * 0.009168) / sr) ** 2 * 1000;
}

function Spark({ track, minAlt = 30 }: { track: number[]; minAlt?: number }) {
  const w = 120, h = 34;
  const pts = track.map((a, i) => `${(i / Math.max(1, track.length - 1)) * w},${h - (Math.max(0, a) / 90) * h}`).join(' ');
  const y30 = h - (minAlt / 90) * h;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" role="img" aria-label="Height of the star above the horizon through the night">
      <line x1="0" x2={w} y1={y30} y2={y30} stroke="rgba(255,255,255,.18)" strokeDasharray="3 3" />
      <polyline points={pts} fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Row { h: HostRec; pass: ReturnType<typeof passDuring> }
interface Tr { h: HostRec; ev: TransitEvent; depth: number | null; ok: boolean; partial: boolean; midAlt: number; az: number }

export function Tonight(p: {
  hosts: HostRec[];
  live: boolean;
  canOpen: (h: HostRec) => boolean;
  onOpen: (h: HostRec) => void;
}) {
  const [place, setPlace] = useState<Place>(PLACES[0]!);
  const [custom, setCustom] = useState(false);
  const [gear, setGear] = useState<GearId>('small');
  const [offset, setOffset] = useState(0);
  const [tab, setTab] = useState<'stars' | 'transits'>('stars');
  const [sortBy, setSortBy] = useState<'bright' | 'high'>('bright');
  const [method, setMethod] = useState<'all' | keyof typeof METHODS>('all');
  const [more, setMore] = useState(60);
  const [geoMsg, setGeoMsg] = useState('');
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { place?: Place; gear?: GearId; custom?: boolean } | null;
      if (s?.place && Number.isFinite(s.place.lat) && Number.isFinite(s.place.lon)) { setPlace(s.place); setCustom(!!s.custom); }
      if (s?.gear && GEAR.some((g) => g.id === s.gear)) setGear(s.gear);
    } catch { /* private mode: fine */ }
    setNow(new Date());
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ place, gear, custom })); } catch { /* ignore */ }
  }, [place, gear, custom]);

  const limit = GEAR.find((g) => g.id === gear)!.limit;

  const night: Night | null = useMemo(() => {
    if (!now) return null;
    let from = now;
    if (offset > 0) {
      from = new Date(now);
      from.setDate(from.getDate() + offset);
      from.setHours(12, 0, 0, 0);
    }
    return nextNight(place.lat, place.lon, from);
  }, [now, offset, place]);

  const rows: Row[] = useMemo(() => {
    if (!night) return [];
    const out: Row[] = [];
    for (const h of p.hosts) {
      if (h.m === null || h.m > limit) continue;
      if (Math.abs(h.dec - place.lat) > 60) continue; // can never climb to 30 degrees here
      const pass = passDuring(h.ra, h.dec, place.lat, place.lon, night, 30);
      if (pass.maxAlt >= 30) out.push({ h, pass });
    }
    return out;
  }, [p.hosts, night, limit, place]);

  const shown = useMemo(() => {
    const r = rows.filter((x) => method === 'all' || x.h.t === method);
    return r.sort((a, b) => (sortBy === 'bright' ? (a.h.m ?? 99) - (b.h.m ?? 99) : b.pass.maxAlt - a.pass.maxAlt));
  }, [rows, sortBy, method]);

  const transits: Tr[] = useMemo(() => {
    if (!night || !now) return [];
    const from = new Date(night.start.getTime() - 3 * 3600000);
    const horizon = 5 * 24 * 3600000;
    const out: Tr[] = [];
    for (const h of p.hosts) {
      if (h.t !== 'transit' || !h.tm || !h.p || h.m === null || h.m > limit) continue;
      const dur = h.td ?? 2.5;
      const depth = depthPpt(h);
      if (gear !== 'club' && depth !== null && depth < 2) continue;
      if (Math.abs(h.dec - place.lat) > 70) continue;
      for (const ev of nextTransits(h.tm, h.p, dur, from, Math.min(40, Math.ceil(horizon / 86400000 / h.p) + 1))) {
        if (ev.start.getTime() > from.getTime() + horizon) break;
        const o = observability(h.ra, h.dec, place.lat, place.lon, ev);
        if (!o.partial) continue;
        const mid = jdOf(ev.mid);
        out.push({ h, ev, depth, ok: o.ok, partial: o.partial, midAlt: o.midAlt, az: azimuth(h.ra, h.dec, place.lat, place.lon, mid) });
      }
    }
    return out.sort((a, b) => a.ev.mid.getTime() - b.ev.mid.getTime());
  }, [p.hosts, night, now, limit, gear, place]);

  const fullOnly = transits.filter((t) => t.ok);
  const haveEphemeris = p.hosts.some((h) => h.tm);

  const locate = () => {
    setGeoMsg('');
    if (!navigator.geolocation) { setGeoMsg('Your browser cannot share its location. Pick a city instead.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setPlace({ name: 'Your location', lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100 }); setCustom(true); },
      () => setGeoMsg('Location was blocked. Pick a city or type your latitude and longitude.'),
      { timeout: 10000 },
    );
  };

  const sel = 'min-h-12 w-full rounded-lg border border-white/15 bg-[#0a0a0d] px-3 text-sm text-white focus:border-white focus:outline-none';
  const moon = night ? Math.round(moonLit(jdOf(night.start)) * 100) : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 md:px-6 md:py-12">
      <div className="eyebrow flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#ff7a45]" />Observation planner</div>
      <h1 className="mt-2 text-[30px] leading-tight text-white md:text-5xl">Tonight’s sky</h1>
      <p className="mt-1 font-mono text-xs text-[#8a8a96] md:text-sm">{place.name} · {place.lat.toFixed(2)}° {place.lon.toFixed(2)}°</p>
      <p className="mt-4 hidden max-w-2xl text-[15px] sm:block leading-relaxed text-[#b4b4be]">Pick where you are and what you are using. AstroPulse lists the stars with known planets that are high enough in the sky, and the planet transits you could catch. {p.live ? '' : 'Transit times need the live NASA list, which is not loaded right now.'}</p>

      <section className="panel mt-7 rounded-xl p-4 md:p-5" aria-label="Where and with what">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="col-span-2 block md:col-span-1">
            <span className="eyebrow">Where</span>
            <select
              className={`${sel} mt-1.5`}
              value={custom ? 'custom' : place.name}
              onChange={(e) => {
                if (e.target.value === 'custom') { setCustom(true); return; }
                setCustom(false);
                setPlace(PLACES.find((x) => x.name === e.target.value) ?? PLACES[0]!);
              }}
            >
              {PLACES.map((x) => (<option key={x.name} value={x.name}>{x.name}</option>))}
              <option value="custom">{custom ? `${place.name} (${place.lat}, ${place.lon})` : 'My own latitude and longitude…'}</option>
            </select>
          </label>
          <div className="col-span-2 md:col-span-1">
            <span className="eyebrow">What you have</span>
            <div className="hide-scroll mt-1.5 flex gap-1.5 overflow-x-auto md:flex-wrap" role="group" aria-label="What you have">
              {GEAR.map((g) => (<button key={g.id} type="button" aria-pressed={gear === g.id} onClick={() => { setGear(g.id as GearId); setMore(60); }} className="pill min-h-11 shrink-0 px-3.5 !text-[11px]" title={g.hint}>{g.label}</button>))}
            </div>
          </div>
          <label className="col-span-2 block md:col-span-1">
            <span className="eyebrow">Which night</span>
            <select className={`${sel} mt-1.5`} value={offset} onChange={(e) => setOffset(Number(e.target.value))}>
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (<option key={d} value={d}>{d === 0 ? 'Tonight' : d === 1 ? 'Tomorrow night' : `In ${d} nights`}</option>))}
            </select>
          </label>
          <div className="col-span-2 flex items-end md:col-span-1">
            <button type="button" onClick={locate} className="pill min-h-11 w-full px-4">Use my location</button>
          </div>
        </div>
        {custom ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {([['Latitude (north is +)', 'lat'], ['Longitude (east is +)', 'lon']] as const).map(([label, k]) => (
              <label key={k} className="block">
                <span className="eyebrow">{label}</span>
                <input type="number" step="0.01" className={`${sel} mt-1.5`} value={place[k]} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setPlace({ ...place, name: 'Your location', [k]: Math.max(k === 'lat' ? -89 : -180, Math.min(k === 'lat' ? 89 : 180, v)) }); }} />
              </label>
            ))}
          </div>
        ) : null}
        {geoMsg ? <p role="alert" className="mt-3 text-sm text-[#fca5a5]">{geoMsg}</p> : null}

        {night ? (
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            {([
              ['Sun sets', night.sunset ? `${clock(night.sunset)}` : '–'],
              ['Fully dark', `${clock(night.start)} to ${clock(night.end)}`],
              ['Sun rises', night.sunrise ? `${clock(night.sunrise)}` : '–'],
              ['Moon', moon === null ? '–' : moon > 70 ? `${moon}% lit: bright, hides faint stars` : moon > 30 ? `${moon}% lit` : `${moon}% lit: dark sky`],
            ] as const).map(([k, v]) => (<div key={k} className="cell"><dt className="k">{k}</dt><dd className="v !text-[13px] leading-snug">{v}</dd></div>))}
          </dl>
        ) : (
          <p className="mt-4 text-sm text-[#c9d5ee]">{now ? 'The Sun does not get low enough for a dark night here on this date.' : 'Working out the night…'}</p>
        )}
        <p className="mt-2 text-xs text-[#8b8b96]">Times are in {tz}. “Dark” means the Sun is at least 12° below the horizon.</p>
      </section>

      <div className="mt-6 grid grid-cols-2 gap-2 md:flex md:flex-wrap" role="group" aria-label="What to show">
        {([['stars', `Stars up (${shown.length.toLocaleString()})`], ['transits', `Planet transits (${fullOnly.length})`]] as const).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className="pill min-h-12 px-3 md:px-5">{label}</button>
        ))}
      </div>

      {tab === 'stars' ? (
        <section className="mt-5" aria-label="Stars you can see tonight">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow mr-1">Sort</span>
            {([['bright', 'Brightest'], ['high', 'Highest']] as const).map(([k, l]) => (<button key={k} type="button" aria-pressed={sortBy === k} onClick={() => setSortBy(k)} className="pill min-h-9 px-3.5 !text-[11px]">{l}</button>))}
            <span className="eyebrow ml-3 mr-1">Found by</span>
            <button type="button" aria-pressed={method === 'all'} onClick={() => setMethod('all')} className="pill min-h-9 px-3.5 !text-[11px]">All</button>
            {(Object.keys(METHODS) as Array<keyof typeof METHODS>).map((m) => (<button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)} className="pill min-h-9 px-3.5 !text-[11px]">{METHODS[m].short}</button>))}
          </div>
          {!night ? null : shown.length === 0 ? (
            <p className="panel mt-4 rounded-xl p-5 text-[15px] text-[#c9d5ee]">Nothing with a known planet is bright enough and high enough with {GEAR.find((g) => g.id === gear)!.label.toLowerCase()} on this night. Try a bigger telescope or another night.</p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shown.slice(0, more).map(({ h, pass }) => {
                const jd = jdOf(pass.bestTime);
                return (
                  <li key={`${h.n}-${h.pl}`} className="panel flex flex-col rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-heading text-lg font-bold text-white">{h.n}</div>
                        <div className="eyebrow !text-[10px]">{h.np && h.np > 1 ? `${h.np} planets` : '1 planet'} · {h.t === 'other' ? (h.om ?? 'other method').toLowerCase() : METHODS[h.t].short.toLowerCase()}</div>
                      </div>
                      <span className="chip plain shrink-0" style={{ ['--c' as string]: h.t === 'other' ? '#b4b4be' : METHODS[h.t].color }}>{h.m!.toFixed(1)} mag</span>
                    </div>
                    <div className="mt-3"><Spark track={pass.track} /></div>
                    <p className="mt-1 text-sm text-[#c9d5ee]">Highest at <b className="text-white">{clock(pass.bestTime)}</b>, {Math.round(pass.maxAlt)}° up, look {compass(azimuth(h.ra, h.dec, place.lat, place.lon, jd))}.</p>
                    <p className="text-xs text-[#8b8b96]">Above 30° for {Math.round(pass.upFrac * 100)}% of the night.</p>
                    <div className="mt-auto pt-3">
                      {p.canOpen(h) ? <button type="button" onClick={() => p.onOpen(h)} className="pill min-h-10 w-full px-4">Study this star →</button> : <span className="text-xs text-[#8b8b96]">No practice lab yet</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {shown.length > more ? <div className="mt-5 text-center"><button type="button" onClick={() => setMore(more + 60)} className="pill min-h-11 px-6">Show more ({(shown.length - more).toLocaleString()} left)</button></div> : null}
        </section>
      ) : (
        <section className="mt-5" aria-label="Planet transits you could watch">
          {!haveEphemeris ? (
            <p className="panel rounded-xl p-5 text-[15px] text-[#c9d5ee]">Transit times come from the live NASA list. It is not loaded right now (offline sample). Open the Catalog page and press “Update from NASA”, then come back.</p>
          ) : fullOnly.length === 0 && transits.length === 0 ? (
            <p className="panel rounded-xl p-5 text-[15px] text-[#c9d5ee]">No transits of stars this bright happen in the next few nights from here. Try “Club telescope”, another place, or another night.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-2xl text-sm text-[#c9d5ee]">Next 5 days. <b className="text-white">Whole transit</b> means the star is above 25° and the sky is dark from start to end. Times come from NASA’s orbit tables and can be off by several minutes.</p>
                {fullOnly.length ? (
                  <button type="button" className="pill min-h-10 px-4" onClick={() => download('astropulse-transits.ics', icsFor(fullOnly.map((t) => ({ title: `${t.h.n} ${t.h.pl}: transit`, start: t.ev.start, end: t.ev.end, note: `Dip about ${t.depth ? t.depth.toFixed(1) + ' parts per thousand' : 'unknown'}. Star brightness ${t.h.m?.toFixed(1)} mag. Check the time on exoclock.space before a long session.` }))))}>Add all {fullOnly.length} to my calendar</button>
                ) : null}
              </div>
              <ul className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {transits.slice(0, more).map((t, i) => {
                  const hrs = (t.ev.end.getTime() - t.ev.start.getTime()) / 3600000;
                  const when = `${clock(t.ev.start)} – ${clock(t.ev.end)}`;
                  return (
                    <li key={`${t.h.n}-${t.ev.epoch}-${i}`} className="panel flex flex-col rounded-xl p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="chip" style={{ ['--c' as string]: METHODS.transit.color }}>Transit</span>
                        <span className="chip plain" style={{ ['--c' as string]: t.ok ? '#4ade80' : '#fbbf24' }}>{t.ok ? 'Whole transit' : 'Partly visible'}</span>
                        {t.depth ? <span className="hud ml-auto uppercase">{t.depth >= 10 ? 'Easy' : t.depth >= 3 ? 'Doable' : 'Hard'}</span> : null}
                      </div>
                      <div className="mt-3 flex items-start justify-between gap-3">
                        <h3 className="min-w-0 text-[22px] leading-7">{t.h.n} <span className="font-medium text-[#8a8a96]">{t.h.pl}</span></h3>
                        <div className="shrink-0 text-right"><div className="eyebrow !text-[10px]">Star</div><div className="font-mono text-sm text-white">{t.h.m!.toFixed(1)} mag</div></div>
                      </div>
                      <div className="mt-1 text-sm text-[#b4b4be]">{dayName(t.ev.mid)} · {when}</div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="cell"><div className="k">Length</div><div className="v !text-[13px]">{Math.floor(hrs)}h {String(Math.round((hrs % 1) * 60)).padStart(2, '0')}m</div></div>
                        <div className="cell"><div className="k">Dip</div><div className="v !text-[13px]">{t.depth ? `${(t.depth * 1000).toFixed(0)} ppm` : '–'}</div></div>
                        <div className="cell"><div className="k">Peak</div><div className="v !text-[13px]">{Math.round(t.midAlt)}° {compass(t.az)}</div></div>
                      </div>
                      <div className="mt-auto grid gap-2 pt-3">
                        <button type="button" className="pill-primary min-h-12 w-full px-3 !text-[11px]" onClick={() => download(`transit-${t.h.n.replace(/\W+/g, '-')}.ics`, icsFor([{ title: `${t.h.n} ${t.h.pl}: transit`, start: t.ev.start, end: t.ev.end, note: `Star brightness ${t.h.m?.toFixed(1)} mag.` }]))}>Add to calendar ({when})</button>
                        {p.canOpen(t.h) ? <button type="button" className="pill min-h-11 w-full !text-[11px]" onClick={() => p.onOpen(t.h)}>Study this star →</button> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {transits.length > more ? <div className="mt-5 text-center"><button type="button" onClick={() => setMore(more + 60)} className="pill min-h-11 px-6">Show more</button></div> : null}
            </>
          )}
        </section>
      )}
    </div>
  );
}
