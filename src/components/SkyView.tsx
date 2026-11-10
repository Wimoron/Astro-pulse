'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { difficultyLabel, type SkyTarget } from '@/lib/catalog';
import { distanceWords } from '@/lib/hosts';
import { METHODS, type Method } from '@/lib/methods';

export type StarRec = [number, number, number, number, string?]; // ra, dec, mag, bv, name
export interface ConstellationRec {
  id: string;
  name: string;
  label: [number, number] | null;
  lines: Array<Array<[number, number]>>;
}

const D2R = Math.PI / 180;

function vec(ra: number, dec: number): [number, number, number] {
  const a = ra * D2R;
  const d = dec * D2R;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}

function bvColor(bv: number): string {
  const t = Math.max(-0.3, Math.min(1.8, bv));
  if (t < 0.3) return '#b8d0ff';
  if (t < 0.6) return '#e6eeff';
  if (t < 1.0) return '#fff1d0';
  if (t < 1.4) return '#ffd9a0';
  return '#ffb984';
}

interface Props {
  stars: StarRec[];
  constellations: ConstellationRec[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenTelescope: (id: string) => void;
  onStudy: (id: string) => void;
  realIds: Set<string>;
  checking: string | null;
  /** Every star with a known planet. */
  targets: SkyTarget[];
  /** The hand-written stories shown as quick buttons. */
  featured: SkyTarget[];
}

export function SkyView({ stars, constellations, selectedId, onSelect, onOpenTelescope, onStudy, realIds, checking, targets, featured }: Props) {
  const [filter, setFilter] = useState<Method | 'all'>('all');
  const [query, setQuery] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const targetsRef = useRef<SkyTarget[]>(targets);
  const featuredIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    targetsRef.current = filter === 'all' ? targets : targets.filter((t) => t.method === filter);
    featuredIds.current = new Set(featured.map((f) => f.id));
  }, [targets, featured, filter]);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef({ ra: 300, dec: 35, fov: 95 });
  const size = useRef({ w: 800, h: 600 });
  const vecs = useRef<Float32Array>(new Float32Array(0));
  const fly = useRef<null | { t0: number; dur: number; from: { ra: number; dec: number; fov: number }; to: { ra: number; dec: number; fov: number } }>(null);
  const hover = useRef<string | null>(null);
  const sel = useRef<string | null>(selectedId);
  const [readout, setReadout] = useState('');
  const [showLines, setShowLines] = useState(true);
  const [showNames, setShowNames] = useState(true);
  const linesRef = useRef(true);
  const namesRef = useRef(true);
  useEffect(() => {
    linesRef.current = showLines;
    namesRef.current = showNames;
    sel.current = selectedId;
  }, [showLines, showNames, selectedId]);

  useEffect(() => {
    const a = new Float32Array(stars.length * 3);
    stars.forEach((s, i) => {
      const v = vec(s[0], s[1]);
      a[i * 3] = v[0];
      a[i * 3 + 1] = v[1];
      a[i * 3 + 2] = v[2];
    });
    vecs.current = a;
  }, [stars]);

  const flyTo = useCallback((ra: number, dec: number, fov: number) => {
    const v = view.current;
    let dra = ra - v.ra;
    while (dra > 180) dra -= 360;
    while (dra < -180) dra += 360;
    fly.current = { t0: performance.now(), dur: 1300, from: { ...v }, to: { ra: v.ra + dra, dec, fov } };
  }, []);

  // Fly to a target whenever one gets selected.
  useEffect(() => {
    if (!selectedId) return;
    const t = targets.find((x) => x.id === selectedId);
    if (t) flyTo(t.ra, t.dec, 18);
  }, [selectedId, flyTo, targets]);

  useEffect(() => {
    const el = wrap.current;
    const c = canvas.current;
    if (!el || !c) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      size.current = { w: el.clientWidth, h: el.clientHeight };
      c.width = Math.floor(el.clientWidth * dpr);
      c.height = Math.floor(el.clientHeight * dpr);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pointer interaction: drag to pan, wheel and pinch to zoom, tap a target to select.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch = 0;
    const project = (ra: number, dec: number) => {
      const v = view.current;
      const { w, h } = size.current;
      const [x, y, z] = vec(ra, dec);
      const c0 = vec(v.ra, v.dec);
      const d = x * c0[0] + y * c0[1] + z * c0[2];
      if (d < -0.98) return null;
      const lam = v.ra * D2R;
      const phi = v.dec * D2R;
      const e: [number, number, number] = [-Math.sin(lam), Math.cos(lam), 0];
      const n: [number, number, number] = [-Math.sin(phi) * Math.cos(lam), -Math.sin(phi) * Math.sin(lam), Math.cos(phi)];
      const k = 2 / (1 + d);
      const scale = Math.min(w, h) / 2 / (2 * Math.tan((v.fov * D2R) / 4));
      return { x: w / 2 - scale * k * (x * e[0] + y * e[1] + z * e[2]), y: h / 2 - scale * k * (x * n[0] + y * n[1] + z * n[2]) };
    };
    const hit = (px: number, py: number): SkyTarget | null => {
      let best: SkyTarget | null = null;
      let bd = 20;
      for (const t of targetsRef.current) {
        const p = project(t.ra, t.dec);
        if (!p) continue;
        const d = Math.hypot(p.x - px, p.y - py);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      return best;
    };
    const down = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      moved = 0;
      fly.current = null;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    };
    const move = (e: PointerEvent) => {
      const prev = pts.get(e.pointerId);
      if (!prev) {
        const h = hit(e.offsetX, e.offsetY);
        hover.current = h ? h.id : null;
        c.style.cursor = h ? 'pointer' : 'grab';
        return;
      }
      const v = view.current;
      const { w, h } = size.current;
      if (pts.size === 1) {
        const dpp = v.fov / Math.min(w, h);
        const dx = e.offsetX - prev.x;
        const dy = e.offsetY - prev.y;
        moved += Math.abs(dx) + Math.abs(dy);
        v.ra += (dx * dpp) / Math.max(0.15, Math.cos(v.dec * D2R));
        v.dec = Math.max(-89, Math.min(89, v.dec + dy * dpp));
        v.ra = ((v.ra % 360) + 360) % 360;
      }
      pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch > 0) v.fov = Math.max(1.2, Math.min(140, v.fov * (pinch / dist)));
        pinch = dist;
      }
    };
    const up = (e: PointerEvent) => {
      const wasTap = pts.size === 1 && moved < 6;
      pts.delete(e.pointerId);
      pinch = 0;
      if (wasTap) {
        const t = hit(e.offsetX, e.offsetY);
        if (t) onSelect(t.id);
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      fly.current = null;
      view.current.fov = Math.max(1.2, Math.min(140, view.current.fov * Math.exp(e.deltaY * 0.0015)));
    };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', wheel, { passive: false });
    return () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
      c.removeEventListener('wheel', wheel);
    };
  }, [onSelect]);

  // Render loop.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = (now: number) => {
      const f = fly.current;
      const v = view.current;
      if (f) {
        const k = Math.min(1, (now - f.t0) / f.dur);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        v.ra = (((f.from.ra + (f.to.ra - f.from.ra) * e) % 360) + 360) % 360;
        v.dec = f.from.dec + (f.to.dec - f.from.dec) * e;
        // Zoom out a little mid-flight so the journey reads as movement.
        v.fov = f.from.fov + (f.to.fov - f.from.fov) * e + Math.sin(Math.PI * e) * 18;
        if (k >= 1) fly.current = null;
      }
      const dpr = window.devicePixelRatio || 1;
      const { w, h } = size.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
      bg.addColorStop(0, '#08080b');
      bg.addColorStop(1, '#030304');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const lam = v.ra * D2R;
      const phi = v.dec * D2R;
      const c0: [number, number, number] = [Math.cos(phi) * Math.cos(lam), Math.cos(phi) * Math.sin(lam), Math.sin(phi)];
      const e: [number, number, number] = [-Math.sin(lam), Math.cos(lam), 0];
      const n: [number, number, number] = [-Math.sin(phi) * Math.cos(lam), -Math.sin(phi) * Math.sin(lam), Math.cos(phi)];
      const scale = Math.min(w, h) / 2 / (2 * Math.tan((v.fov * D2R) / 4));
      const proj = (x: number, y: number, z: number) => {
        const d = x * c0[0] + y * c0[1] + z * c0[2];
        if (d < -0.97) return null;
        const k = 2 / (1 + d);
        return [w / 2 - scale * k * (x * e[0] + y * e[1] + z * e[2]), h / 2 - scale * k * (x * n[0] + y * n[1] + z * n[2])] as const;
      };

      // Constellation lines.
      if (linesRef.current) {
        ctx.strokeStyle = 'rgba(110,150,230,0.30)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const con of constellations) {
          for (const seg of con.lines) {
            let prev: readonly [number, number] | null = null;
            for (const p of seg) {
              const q = vec(p[0], p[1]);
              const s = proj(q[0], q[1], q[2]);
              if (s && prev) {
                ctx.moveTo(prev[0], prev[1]);
                ctx.lineTo(s[0], s[1]);
              }
              prev = s;
            }
          }
        }
        ctx.stroke();
      }

      // Stars.
      const limit = v.fov > 100 ? 5.4 : v.fov > 60 ? 6.0 : v.fov > 30 ? 6.8 : v.fov > 12 ? 7.4 : 7.7;
      const boost = Math.min(2.2, 0.8 + 40 / Math.max(8, v.fov));
      const a = vecs.current;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i]!;
        if (s[2] > limit) continue;
        const p = proj(a[i * 3]!, a[i * 3 + 1]!, a[i * 3 + 2]!);
        if (!p || p[0] < -10 || p[0] > w + 10 || p[1] < -10 || p[1] > h + 10) continue;
        const r = Math.max(0.55, Math.min(6.5, (limit + 0.9 - s[2]) * 0.5 * boost));
        ctx.fillStyle = bvColor(s[3]);
        ctx.globalAlpha = Math.min(1, 0.45 + r * 0.25);
        ctx.beginPath();
        ctx.arc(p[0], p[1], r, 0, 6.2832);
        ctx.fill();
        if (namesRef.current && s[4] && (s[2] < 2.3 || v.fov < 45)) {
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = '#aab9d6';
          ctx.font = '11px system-ui, sans-serif';
          ctx.fillText(s[4], p[0] + r + 4, p[1] + 3);
        }
      }
      ctx.globalAlpha = 1;

      // Constellation names.
      if (linesRef.current && v.fov > 22) {
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(150,180,240,0.55)';
        ctx.textAlign = 'center';
        for (const con of constellations) {
          if (!con.label) continue;
          const q = vec(con.label[0], con.label[1]);
          const s = proj(q[0], q[1], q[2]);
          if (s && s[0] > 0 && s[0] < w && s[1] > 0 && s[1] < h) ctx.fillText(con.name.toUpperCase(), s[0], s[1]);
        }
        ctx.textAlign = 'left';
      }

      // Target markers.
      const pulse = reduce ? 0.5 : (Math.sin(now / 420) + 1) / 2;
      for (const t of targetsRef.current) {
        const q = vec(t.ra, t.dec);
        const s = proj(q[0], q[1], q[2]);
        if (!s || s[0] < -40 || s[0] > w + 40 || s[1] < -40 || s[1] > h + 40) continue;
        const isSel = sel.current === t.id;
        const isHover = hover.current === t.id;
        const isFeat = featuredIds.current.has(t.id);
        const col = METHODS[t.method].color;
        const big = isSel || isHover || isFeat;
        if (big) {
          ctx.strokeStyle = isSel ? '#fff' : col;
          ctx.lineWidth = isSel ? 1.5 : 1;
          ctx.beginPath();
          ctx.arc(s[0], s[1], 9 + (isSel || isHover ? 2 : 0), 0, 6.2832);
          ctx.stroke();
          if (isSel) {
            ctx.globalAlpha = 0.5 * (1 - pulse);
            ctx.beginPath();
            ctx.arc(s[0], s[1], 14 + pulse * 12, 0, 6.2832);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
        // Everyone else is a small dot, coloured by method.
        ctx.fillStyle = col;
        ctx.globalAlpha = big ? 1 : 0.85;
        ctx.beginPath();
        ctx.arc(s[0], s[1], big ? 3.2 : v.fov < 20 ? 3 : 2.2, 0, 6.2832);
        ctx.fill();
        ctx.globalAlpha = 1;
        // Label chip: featured, selected, hovered, or any star once zoomed in.
        if (!(big || v.fov < 12)) continue;
        ctx.font = '600 12px Montserrat, Inter, system-ui, sans-serif';
        const label = t.name;
        const tw = ctx.measureText(label).width;
        const lx = s[0] + 16;
        const ly = s[1] - 4;
        ctx.fillStyle = 'rgba(5,5,6,0.92)';
        ctx.fillRect(lx - 6, ly - 14, tw + 12, 22);
        ctx.strokeStyle = isSel ? '#fff' : 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(lx - 6 + 0.5, ly - 14 + 0.5, tw + 12, 22);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, lx, ly + 2);
      }

      // Soft vignette.
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.8);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const iv = setInterval(() => {
      const v = view.current;
      const raH = v.ra / 15;
      setReadout(`RA ${Math.floor(raH)}h ${String(Math.floor((raH % 1) * 60)).padStart(2, '0')}m · Dec ${v.dec >= 0 ? '+' : '−'}${Math.abs(Math.round(v.dec))}° · view ${v.fov < 10 ? v.fov.toFixed(1) : Math.round(v.fov)}°`);
    }, 400);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(iv);
    };
  }, [stars, constellations]);

  const selected = targets.find((t) => t.id === selectedId) ?? null;
  const q = query.trim().toLowerCase();
  const results = (q ? targets.filter((t) => t.name.toLowerCase().includes(q) || (t.planet?.label ?? '').toLowerCase().includes(q)) : targets.filter((t) => filter === 'all' || t.method === filter)).slice(0, 40);
  const isTransit = selected?.method === 'transit';

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden bg-[#03060d]">
      <canvas ref={canvas} role="img" aria-label="Interactive map of the night sky with stars that have known planets marked." className="absolute inset-0 h-full w-full touch-none" style={{ cursor: 'grab' }} />

      <div className="pointer-events-none absolute inset-0 flex flex-col gap-3 p-3 md:p-4">
        {/* top row: finder (left), view toggles (right) */}
        <div className="flex items-start justify-between gap-3">
          <div className="pointer-events-auto relative w-full max-w-[420px] panel rounded-xl p-2.5">
            <input
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setListOpen(true); }}
              onFocus={() => setListOpen(true)}
              placeholder={`Search ${targets.length.toLocaleString()} stars you can practise on…`}
              aria-label="Search stars"
              className="min-h-11 w-full glass-in rounded-xl px-3 text-sm text-white placeholder:text-[#8da0c4]"
            />
            <div className="hide-scroll mt-2 flex gap-1.5 overflow-x-auto" role="group" aria-label="Show only stars found by one method">
              {(['all', 'transit', 'rv', 'imaging', 'microlensing', 'astrometry'] as const).map((m) => (
                <button key={m} type="button" aria-pressed={filter === m} onClick={() => { setFilter(m); setListOpen(false); }} className="pill min-h-9 shrink-0 px-3.5 text-xs font-semibold">
                  {m === 'all' ? 'All' : METHODS[m].short}
                </button>
              ))}
            </div>
            <div className="hide-scroll mt-2 flex gap-1.5 overflow-x-auto sm:hidden" role="group" aria-label="Map options and good first stars">
              <button type="button" aria-pressed={showLines} onClick={() => setShowLines((x) => !x)} className="pill min-h-9 shrink-0 px-3 !text-[11px]">Constellations</button>
              <button type="button" aria-pressed={showNames} onClick={() => setShowNames((x) => !x)} className="pill min-h-9 shrink-0 px-3 !text-[11px]">Names</button>
              {featured.map((t) => (<button key={t.id} type="button" onClick={() => onSelect(t.id)} className="pill min-h-9 shrink-0 px-3 !text-[11px]">{t.name}</button>))}
            </div>
            {listOpen ? (
              <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-72 overflow-y-auto panel rounded-xl shadow-2xl" role="listbox" aria-label="Matching stars">
                {results.length === 0 ? <div className="p-3 text-sm text-[#b3c0da]">No star with that name.</div> : null}
                {results.map((t) => (
                  <button key={t.id} type="button" role="option" aria-selected={t.id === selectedId} onClick={() => { onSelect(t.id); setListOpen(false); setQuery(''); }} className="flex min-h-11 w-full items-center gap-2.5 border-b border-white/5 px-3.5 text-left text-sm text-white last:border-0 hover:bg-white/5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: METHODS[t.method].color }} />
                    <span className="flex-1 truncate font-medium">{t.name}</span>
                    <span className="text-xs text-[#b3c0da]">{METHODS[t.method].short}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="pointer-events-auto hidden shrink-0 gap-2 sm:flex" role="group" aria-label="Map options">
            <button type="button" aria-pressed={showLines} onClick={() => setShowLines((x) => !x)} className="pill min-h-10 px-4 text-sm font-medium">Constellations</button>
            <button type="button" aria-pressed={showNames} onClick={() => setShowNames((x) => !x)} className="pill min-h-10 px-4 text-sm font-medium">Star names</button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-end justify-between gap-3 md:items-stretch md:justify-end">
          <div className="pointer-events-none hidden self-end font-mono text-[11px] text-[#8da0c4] md:block">{readout}</div>

          {/* right column (desktop) / bottom sheet (mobile) */}
          <aside className="pointer-events-auto flex max-h-full w-full flex-col md:w-[340px] md:self-start md:overflow-y-auto" aria-label={selected ? `Details for ${selected.name}` : 'Where to start'}>
            {selected ? (
              <div className="panel rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="eyebrow">{selected.constellation ? `in ${selected.constellation}` : distanceWords(selected.planet?.distLy)}</div>
                    <h2 className="mt-1 truncate text-2xl leading-tight text-white">{selected.name}</h2>
                  </div>
                  <button type="button" onClick={() => onSelect('')} aria-label="Close details" className="pill grid h-9 w-9 shrink-0 place-items-center text-lg leading-none">×</button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#050506]" style={{ background: METHODS[selected.method].color }}>{METHODS[selected.method].name}</span>
                  <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#d4d4dc]">{difficultyLabel(selected.difficulty)}</span>
                  {isTransit ? (
                    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${realIds.has(selected.id) ? 'bg-[#14532d] text-[#bbf7d0]' : checking === selected.id ? 'bg-white/10 text-[#dbe5ff]' : 'bg-[#4a3410] text-[#fde68a]'}`}>
                      {selected.mission === 'Practice' ? 'Practice data' : realIds.has(selected.id) ? 'Real NASA data' : checking === selected.id ? 'Checking NASA…' : 'Stand-in data'}
                    </span>
                  ) : (
                    <span className="rounded bg-[#3a2a10] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#fcd34d]">Practice data</span>
                  )}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[#d5def5]">{selected.tagline}.</p>
                {selected.planet ? (
                  <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-white/10 text-sm">
                    {([
                      ['Distance', selected.planet.distLy != null ? `${Math.round(selected.planet.distLy).toLocaleString()} ly` : '—'],
                      ['Orbit', selected.planet.periodDays != null ? `${+selected.planet.periodDays.toFixed(2)} days` : '—'],
                      ['Size', selected.planet.radiusEarth != null ? `${+selected.planet.radiusEarth.toFixed(1)} × Earth` : selected.planet.massJup != null ? `${+selected.planet.massJup.toFixed(2)} Jupiters` : '—'],
                      ['Found', selected.planet.year ? String(selected.planet.year) : '—'],
                    ] as const).map(([k, v]) => (
                      <div key={k} className="bg-[#0a0a0d] px-3 py-2"><dt className="eyebrow">{k}</dt><dd className="mt-0.5 font-medium text-white">{v}</dd></div>
                    ))}
                  </dl>
                ) : null}
                <button type="button" onClick={() => (isTransit ? onOpenTelescope(selected.id) : onStudy(selected.id))} className="pill-primary mt-4 min-h-12 w-full px-5">
                  {isTransit ? 'Look through the telescope →' : `Practice the ${METHODS[selected.method].short.toLowerCase()} method →`}
                </button>
              </div>
            ) : (
              <div className="hidden panel rounded-xl p-4 md:block">
                <div className="eyebrow">How to use the map</div>
                <ol className="mt-2 space-y-1.5 text-sm text-[#c9d5ee]">
                  <li><b className="text-white">Drag</b> to look around, <b className="text-white">scroll</b> to zoom.</li>
                  <li>Each <b className="text-white">dot</b> is a star with a known planet. Colour = how it was found.</li>
                  <li><b className="text-white">Click</b> a dot, or pick one below.</li>
                </ol>
                <div className="eyebrow mt-4">Good first stars</div>
                <div className="mt-2 grid gap-1.5" role="group" aria-label="Featured stars">
                  {featured.map((t) => (
                    <button key={t.id} type="button" onClick={() => onSelect(t.id)} className="pill flex min-h-11 items-center justify-between gap-3 px-4 text-left">
                      <span className="text-sm font-semibold">{t.name}</span>
                      <span className="text-[11px] text-[#b3c0da]">{difficultyLabel(t.difficulty)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
