'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SkyTarget } from '@/lib/catalog';
import type { LightCurve } from '@/lib/types';
import { rng } from '@/lib/simulate';
import { Plot } from './Plot';
import type { StarRec } from './SkyView';

const D2R = Math.PI / 180;
const RECORD_MS = 7000;

function fmtRa(deg: number): string {
  const h = deg / 15;
  const m = (h % 1) * 60;
  return `${Math.floor(h)}h ${String(Math.floor(m)).padStart(2, '0')}m ${((m % 1) * 60).toFixed(1).padStart(4, '0')}s`;
}
function fmtDec(deg: number): string {
  const a = Math.abs(deg);
  const m = (a % 1) * 60;
  return `${deg < 0 ? '−' : '+'}${Math.floor(a)}° ${String(Math.floor(m)).padStart(2, '0')}′ ${((m % 1) * 60).toFixed(0).padStart(2, '0')}″`;
}

interface Props {
  target: SkyTarget;
  curve: LightCurve | null;
  real: boolean;
  stars: StarRec[];
  onBack: () => void;
  onOpenLab: () => void;
}

export function TelescopeView({ target, curve, real, stars, onBack, onOpenLab }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 600, h: 400 });
  const rec = useRef<{ start: number } | null>(null);
  const prog = useRef(0);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'done'>('idle');
  const [pShown, setPShown] = useState(0);

  // Real catalog neighbours (within 0.7 degrees) plus a deterministic field of faint stars.
  const field = useMemo(() => {
    const lam0 = target.ra * D2R;
    const phi0 = target.dec * D2R;
    const near: Array<{ x: number; y: number; mag: number }> = [];
    const maxR = Math.tan(0.7 * D2R);
    for (const s of stars) {
      const dRa = s[0] * D2R - lam0;
      const phi = s[1] * D2R;
      const D = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(dRa);
      if (D <= 0) continue;
      const x = (Math.cos(phi) * Math.sin(dRa)) / D;
      const y = (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(dRa)) / D;
      if (Math.hypot(x, y) <= maxR) near.push({ x: x / maxR, y: y / maxR, mag: s[2] });
    }
    const r = rng([...target.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
    const faint: Array<{ x: number; y: number; mag: number }> = [];
    for (let i = 0; i < 420; i++) {
      const a = r() * 6.2832;
      const d = Math.sqrt(r());
      faint.push({ x: d * Math.cos(a), y: d * Math.sin(a), mag: 9 + Math.pow(r(), 0.6) * 7 });
    }
    return [...near, ...faint];
  }, [stars, target]);

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

  const flux = curve?.flux;
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const t0 = performance.now();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const { w, h } = size.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#010204';
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.46;
      const open = reduce ? 1 : Math.max(0, Math.min(1, (now - t0) / 1500));
      const r = R * (1 - Math.pow(1 - open, 3));

      // Recording progress and the star's live brightness.
      let b = 1;
      if (rec.current) {
        const p = Math.max(0, Math.min(1, (now - rec.current.start) / RECORD_MS));
        prog.current = p;
        if (flux && flux.length) {
          const i = Math.min(flux.length - 1, Math.floor(p * flux.length));
          b = Math.max(0.35, Math.min(1.5, 1 + (flux[i]! - 1) * 25));
        }
        if (p >= 1) {
          rec.current = null;
          setPhase('done');
        }
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 6.2832);
      ctx.clip();
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      bg.addColorStop(0, '#07101f');
      bg.addColorStop(1, '#02050b');
      ctx.fillStyle = bg;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      const tw = reduce ? 0 : now / 900;
      for (let i = 0; i < field.length; i++) {
        const s = field[i]!;
        const px = cx - s.x * R; // east is left
        const py = cy - s.y * R;
        const size = Math.max(0.5, (17 - s.mag) * 0.36);
        const a = Math.min(1, 0.25 + (17 - s.mag) * 0.1) * (0.92 + 0.08 * Math.sin(tw + i));
        ctx.globalAlpha = a;
        ctx.fillStyle = s.mag < 8 ? '#ffffff' : '#cfdcff';
        ctx.beginPath();
        ctx.arc(px, py, size, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // The target star: glow, core and spikes, all scaled by its live brightness.
      const gr = R * 0.2 * b;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr);
      glow.addColorStop(0, 'rgba(255,255,255,0.95)');
      glow.addColorStop(0.18, 'rgba(255,244,214,0.65)');
      glow.addColorStop(1, 'rgba(255,230,180,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - gr, cy - gr, gr * 2, gr * 2);
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * Math.min(1, b)})`;
      ctx.lineWidth = 1;
      const sp = R * 0.34 * b;
      ctx.beginPath();
      ctx.moveTo(cx - sp, cy);
      ctx.lineTo(cx + sp, cy);
      ctx.moveTo(cx, cy - sp);
      ctx.lineTo(cx, cy + sp);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5 * Math.min(1.2, b), 0, 6.2832);
      ctx.fill();
      // Crosshair ticks.
      ctx.strokeStyle = 'rgba(103,232,249,0.55)';
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.09, 0, 6.2832);
      ctx.stroke();
      ctx.restore();

      // Eyepiece rim.
      ctx.strokeStyle = '#26324f';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 3, 0, 6.2832);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(103,232,249,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 6.2832);
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [field, flux]);

  useEffect(() => {
    if (phase !== 'recording') return;
    const iv = setInterval(() => setPShown(prog.current), 90);
    return () => clearInterval(iv);
  }, [phase]);

  const start = () => {
    if (!curve) return;
    rec.current = { start: performance.now() };
    prog.current = 0;
    setPShown(0);
    setPhase('recording');
  };

  const shown = phase === 'done' ? 1 : pShown;
  const partial = useMemo(() => {
    if (!curve) return null;
    const n = Math.max(2, Math.floor(curve.time.length * shown));
    const t0 = curve.time[0]!;
    const x = curve.time.slice(0, n).map((t) => t - t0);
    return { x, y: curve.flux.slice(0, n), span: curve.time[curve.time.length - 1]! - t0 };
  }, [curve, shown]);
  const yr = useMemo<[number, number] | undefined>(() => {
    if (!curve) return undefined;
    const s = [...curve.flux].sort((a, b) => a - b);
    const lo = s[Math.floor(s.length * 0.002)]!;
    const hi = s[Math.floor(s.length * 0.998)]!;
    const pad = (hi - lo) * 0.1 || 0.001;
    return [lo - pad, hi + pad];
  }, [curve]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-black md:overflow-hidden">
      <div ref={wrap} className="relative h-[46dvh] min-h-[260px] shrink-0 md:h-auto md:min-h-0 md:flex-1">
        <canvas ref={canvas} role="img" aria-label={`Telescope view of ${target.name}`} className="absolute inset-0 h-full w-full" />
        <div className="absolute left-3 top-3 max-w-[calc(100%-5.75rem)] rounded-full bg-[#0a0a0d]/90 px-3 py-2 sm:hidden">
          <div className="flex items-center gap-2 truncate font-mono text-[11px] text-[#b4b4be]"><span className="h-2 w-2 shrink-0 rounded-full bg-[#67e8f9]" /><b className="truncate font-semibold text-white">{target.name}</b><span className="shrink-0">· {target.magnitude} mag</span></div>
        </div>
        <div className="absolute left-3 top-3 hidden max-w-[280px] glass rounded-xl p-3 text-sm text-[#e6edff] sm:block">
          <div className="truncate text-base font-semibold text-white">{target.name}</div>
          <div className="mt-1 font-mono text-[11px] leading-5 text-[#b3c0da]">
            RA {fmtRa(target.ra)}
            <br />
            Dec {fmtDec(target.dec)}
            <br />
            Brightness {target.magnitude} mag{target.constellation ? ` · ${target.constellation}` : ''}
          </div>
        </div>
        <div className="hud absolute bottom-3 left-3 right-3 flex justify-between">
          <span>{target.constellation ? target.constellation.toUpperCase() : 'EYEPIECE'}</span>
          <span className={real ? 'text-[#4ade80]' : 'text-[#fbbf24]'}>{real ? 'REAL NASA DATA' : 'STAND-IN DATA'}</span>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="absolute right-3 top-3 min-h-10 pill bg-[#0a0a0d] px-3 text-sm font-medium text-white sm:px-4"
          aria-label="Back to the sky"
        >
          ← <span className="hidden sm:inline">Back to the sky</span><span className="sm:hidden">Sky</span>
        </button>
      </div>

      <div className="border-t border-white/10 bg-[#050506] p-4 md:p-4">
        <div className="mx-auto grid max-w-5xl gap-3 md:grid-cols-[1fr_1.25fr] md:items-center">
          <div>
            <div className="flex items-center gap-2 font-heading text-xs font-bold uppercase tracking-[0.12em] text-white"><span className="h-2 w-2 rounded-full bg-[#67e8f9]" />Step 2 of 5: record the starlight</div>
            {phase === 'idle' && (
              <>
                <p className="mt-1 text-sm text-[#d5def5]">
                  This is how the star looks through the {target.mission === 'Kepler' ? 'Kepler' : target.mission === 'TESS' ? 'TESS' : 'practice'} telescope.
                  Press record and watch it for a few weeks in a few seconds. Notice how it dims when something passes in front.
                </p>
                <p className="mt-1 text-xs text-[#9fb0cf]">{real ? 'Using real NASA data.' : 'Using stand-in data modeled on the real planet.'}</p>
              </>
            )}
            {phase === 'recording' && (
              <p className="mt-1 text-sm text-[#d5def5]" role="status">
                Recording… day {partial ? (partial.span * shown).toFixed(1) : '0'} of {partial ? partial.span.toFixed(1) : '…'}. Watch the star’s glow.
              </p>
            )}
            {phase === 'done' && (
              <p className="mt-1 text-sm text-[#d5def5]" role="status">
                Done. You recorded {curve?.time.length.toLocaleString()} readings. Now clean the data and find the planet.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {phase !== 'done' ? (
                <button
                  type="button"
                  onClick={start}
                  disabled={!curve || phase === 'recording'}
                  className="min-h-12 w-full pill-primary px-6 text-base font-semibold disabled:opacity-50 md:w-auto"
                >
                  {!curve ? 'Loading data…' : phase === 'recording' ? 'Recording…' : '● Record starlight'}
                </button>
              ) : (
                <>
                  <button type="button" onClick={onOpenLab} className="min-h-12 w-full pill-primary px-6 text-base font-semibold md:w-auto">
                    Analyse this starlight →
                  </button>
                  <button type="button" onClick={start} className="min-h-12 w-full pill px-5 text-sm font-medium text-white md:w-auto">
                    Record again
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="panel rounded-xl p-3">
            <div className="eyebrow !text-[10px]">Live brightness</div>
            {partial && yr ? (
              <Plot
                ariaLabel="Star brightness being recorded over time"
                series={[{ x: partial.x, y: partial.y, color: '#e6edff' }]}
                xRange={[0, partial.span]}
                yRange={yr}
                xLabel="Days"
                yLabel="Brightness"
                height={150}
              />
            ) : (
              <div className="flex h-[150px] items-center justify-center text-sm text-[#9fb0cf]">Brightness graph appears here</div>
            )}
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div className="cell"><div className="k">Readings</div><div className="v !text-[13px]">{curve ? curve.time.length.toLocaleString() : '–'}</div></div>
              <div className="cell"><div className="k">Span</div><div className="v !text-[13px]">{partial ? `${partial.span.toFixed(1)} d` : '–'}</div></div>
              <div className="cell"><div className="k">Star</div><div className="v !text-[13px]">{target.magnitude} mag</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
