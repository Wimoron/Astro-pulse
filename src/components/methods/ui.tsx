'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { METHODS, type Method } from '@/lib/methods';

export const PANEL = 'glass rounded-xl p-4 md:p-5';
export const BTN2 = 'min-h-11 pill px-4 text-sm font-semibold text-white disabled:opacity-40';
export const BTN1 = 'min-h-11 pill-primary px-5 text-sm font-semibold disabled:opacity-40';

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function Slider(p: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; show: string; hint?: string; nudge?: [number, number] }) {
  const id = `sl-${p.label.replace(/\W+/g, '')}`;
  return (
    <div className="glass-in rounded-xl p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-white">{p.label}</label>
        <span className="font-mono text-sm text-white">{p.show}</span>
      </div>
      <div className="flex items-center gap-2">
        {p.nudge ? <button type="button" aria-label={`${p.label}: a little less`} className="min-h-10 min-w-10 pill text-white" onClick={() => p.onChange(Math.max(p.min, p.value - p.nudge![0]))}>−</button> : null}
        <input id={id} type="range" min={p.min} max={p.max} step={p.step} value={p.value} onChange={(e) => p.onChange(Number(e.target.value))} />
        {p.nudge ? <button type="button" aria-label={`${p.label}: a little more`} className="min-h-10 min-w-10 pill text-white" onClick={() => p.onChange(Math.min(p.max, p.value + p.nudge![1]))}>+</button> : null}
      </div>
      {p.hint ? <p className="mt-1 text-xs text-[#b3c0da]">{p.hint}</p> : null}
    </div>
  );
}

export function Callout({ tone, children }: { tone: 'good' | 'info' | 'warn'; children: ReactNode }) {
  const c = tone === 'good' ? 'border-[#22a55a] bg-[#0d2418] text-[#d1fae5]' : tone === 'warn' ? 'border-[#b8860b] bg-[#2a2008] text-[#fde68a]' : 'border-[#3d5a8c] bg-[#0f1c33] text-[#dbe5ff]';
  return <div className={`rounded-lg border p-3 text-sm ${c}`} role="status">{children}</div>;
}

/** Fraction bar, 0 to 1. */
export function Meter({ label, value, good }: { label: string; value: number; good: boolean }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm"><span className="font-semibold text-white">{label}</span><span className={`font-mono ${good ? 'text-[#4ade80]' : 'text-[#b3c0da]'}`}>{Math.round(value * 100)}%</span></div>
      <div className="h-3 overflow-hidden rounded-full bg-white/10" role="meter" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(2, value * 100)}%`, background: good ? '#4ade80' : '#67e8f9' }} />
      </div>
    </div>
  );
}

export function Words({ items }: { items: Array<[string, string]> }) {
  return (
    <details className="glass-in rounded-xl p-3 text-sm">
      <summary className="cursor-pointer font-semibold text-white">Words used on this page</summary>
      <dl className="mt-2 space-y-2 text-[#dbe5ff]">
        {items.map(([k, v]) => (
          <div key={k}><dt className="font-semibold text-white">{k}</dt><dd className="text-[#b3c0da]">{v}</dd></div>
        ))}
      </dl>
    </details>
  );
}

export interface StepDef {
  title: string;
  job: string;
  body: ReactNode;
  ok: boolean;
  /** What to tell the person while Next is locked. */
  locked?: string;
}

export function Shell(p: { method: Method; heading: string; steps: StepDef[]; onBack: () => void; picker?: ReactNode }) {
  const [i, setI] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { body.current?.scrollTo({ top: 0 }); }, [i]);
  const st = p.steps[i]!;
  const last = i === p.steps.length - 1;
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div ref={body} className="min-h-0 flex-1 overflow-y-auto">
      <div className="bg-[#050506] px-4 pb-2 pt-3 md:px-5">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={p.onBack} className="flex min-h-10 items-center gap-2 font-heading text-xs font-bold uppercase tracking-[0.1em] text-white">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" /></svg>Exit lab
            </button>
            <span className="chip min-w-0 max-w-[62%]" style={{ ['--c' as string]: METHODS[p.method].color }}><span className="truncate">{METHODS[p.method].short} lab · {p.heading}</span></span>
          </div>
          {p.picker ? <div>{p.picker}</div> : null}
          <ol className="flex items-center" aria-label="Steps">
            {p.steps.map((s, k) => (
              <li key={s.title} className={`flex items-center ${k < p.steps.length - 1 ? 'flex-1' : ''}`}>
                <button
                  type="button"
                  disabled={k > i}
                  aria-current={k === i ? 'step' : undefined}
                  aria-label={`Step ${k + 1}: ${s.title}`}
                  onClick={() => setI(k)}
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-heading text-sm font-bold ${k === i ? 'bg-white text-[#050506]' : k < i ? 'bg-[#1c1c22] text-[#67e8f9]' : 'bg-[#14141a] text-[#8a8a96]'}`}
                >
                  {k < i ? (<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>) : k + 1}
                </button>
                {k < p.steps.length - 1 ? <span className={`mx-1.5 h-px flex-1 ${k < i ? 'bg-white/40' : 'bg-white/12'}`} aria-hidden="true" /> : null}
              </li>
            ))}
          </ol>
          <div className="panel rounded-xl p-4">
            <div className="font-heading text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: METHODS[p.method].color }}>Step {i + 1} of {p.steps.length} · {st.title}</div>
            <p className="mt-2 text-[17px] leading-snug text-white">{st.job}</p>
          </div>
        </div>
      </div>
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-3 py-4 md:px-5">{st.body}</div>
      </div>
      <div className="shrink-0 border-t border-white/10 bg-[#050506] px-3 py-3">
        <div className="mx-auto flex max-w-5xl flex-col gap-2">
          {!st.ok && st.locked ? <p className="text-center text-xs text-[#fbbf24]" role="status">{st.locked}</p> : null}
          <div className="flex items-center gap-3">
          <button type="button" className="pill min-h-12 shrink-0 bg-[#1c1c22] px-4" disabled={i === 0} onClick={() => setI(i - 1)}>← Back</button>
          {last ? (
            <button type="button" className="pill-primary min-h-12 min-w-0 flex-1 px-4" onClick={p.onBack}>Finish</button>
          ) : (
            <button type="button" className="pill-primary min-h-12 min-w-0 flex-1 px-4" disabled={!st.ok} onClick={() => setI(i + 1)}><span className="truncate">Next: {p.steps[i + 1]!.title} →</span></button>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small animated picture for each method. */
const CAP: Record<Method, string> = {
  transit: 'The planet crosses: the star gets a little dimmer.',
  rv: 'The planet pulls: the star wobbles.',
  imaging: 'Hide the glare, see the faint dot.',
  microlensing: 'A star passes in front: gravity brightens the far star.',
  astrometry: 'The star draws a tiny circle on the sky.',
};

export function Diagram({ method, caption = true, bare = false }: { method: Method; caption?: boolean; bare?: boolean }) {
  const star = <circle cx="100" cy="80" r="26" fill="#fde68a" />;
  return (
    <figure className={bare ? 'w-full' : 'mx-auto w-full max-w-[280px] max-sm:max-w-[200px]'}>
    <svg viewBox="0 0 200 160" className="h-auto w-full" role="img" aria-label={`Animated picture of the ${METHODS[method].name} method`}>
      <rect width="200" height="160" rx="14" fill={bare ? 'none' : '#04070f'} stroke={bare ? 'none' : 'rgba(255,255,255,0.08)'} />
      {method === 'transit' ? (
        <>
          {star}
          <circle r="8" cy="80" fill="#0b1220" stroke="#4561a0"><animate attributeName="cx" values="30;170;30" dur="6s" repeatCount="indefinite" /></circle>
        </>
      ) : null}
      {method === 'rv' ? (
        <>
          <g><animateTransform attributeName="transform" type="translate" values="-6 0;6 0;-6 0" dur="4s" repeatCount="indefinite" />{star}</g>
          <g><animateTransform attributeName="transform" type="rotate" from="0 100 80" to="360 100 80" dur="4s" repeatCount="indefinite" /><circle cx="100" cy="22" r="7" fill="#67e8f9" /></g>
        </>
      ) : null}
      {method === 'imaging' ? (
        <>
          <circle cx="100" cy="80" r="46" fill="#fde68a" opacity="0.25" />
          <circle cx="100" cy="80" r="26" fill="#fde68a" />
          <circle cx="100" cy="80" r="30" fill="none" stroke="#4561a0" strokeDasharray="3 3" />
          <g><animateTransform attributeName="transform" type="rotate" from="0 100 80" to="360 100 80" dur="12s" repeatCount="indefinite" /><circle cx="100" cy="24" r="4" fill="#fbbf24" /></g>
        </>
      ) : null}
      {method === 'microlensing' ? (
        <>
          <circle cx="100" cy="80" r="6" fill="#fde68a" />
          <circle r="14" cy="80" fill="#0b1220" stroke="#a78bfa" strokeWidth="2"><animate attributeName="cx" values="20;180" dur="6s" repeatCount="indefinite" /></circle>
          <circle r="3" cy="80" fill="#a78bfa"><animate attributeName="cx" values="34;194" dur="6s" repeatCount="indefinite" /></circle>
        </>
      ) : null}
      {method === 'astrometry' ? (
        <>
          <circle cx="100" cy="80" r="26" fill="none" stroke="#2e3d60" strokeDasharray="2 4" />
          <g><animateTransform attributeName="transform" type="rotate" from="0 100 80" to="360 100 80" dur="5s" repeatCount="indefinite" /><circle cx="126" cy="80" r="8" fill="#fde68a" /></g>
          <circle cx="100" cy="80" r="2" fill="#b3c0da" />
        </>
      ) : null}
    </svg>
    {caption ? <figcaption className="mt-1 text-xs text-[#b3c0da]">{CAP[method]}</figcaption> : null}
    </figure>
  );
}

/** Log-scale match curve with a cursor. */
export function MatchCurve({ ps, vals, cursor, label }: { ps: number[]; vals: number[]; cursor: number; label: string }) {
  const W = 600, H = 120, L = 34, R = 8, T = 8, B = 26;
  const lo = Math.log10(ps[0]!), hi = Math.log10(ps[ps.length - 1]!);
  const X = (p: number) => L + ((Math.log10(p) - lo) / (hi - lo)) * (W - L - R);
  const Y = (v: number) => T + (1 - v) * (H - T - B);
  const d = ps.map((p, i) => `${i ? 'L' : 'M'}${X(p).toFixed(1)},${Y(vals[i]!).toFixed(1)}`).join('');
  const ticks: number[] = [];
  for (let e = Math.ceil(lo); e <= hi; e++) ticks.push(Math.pow(10, e));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="#0b1220" stroke="#3d4d78" />
      {ticks.map((t) => (<g key={t}><line x1={X(t)} x2={X(t)} y1={T} y2={H - B} stroke="#22304f" /><text x={X(t)} y={H - 8} textAnchor="middle" fill="#b3c0da" fontSize="11">{t >= 1000 ? `${t / 1000}k` : t}</text></g>))}
      <text x={6} y={T + 10} fill="#b3c0da" fontSize="10">100%</text>
      <text x={10} y={H - B} fill="#b3c0da" fontSize="10">0</text>
      <path d={d} fill="none" stroke="#67e8f9" strokeWidth="2" />
      <line x1={X(cursor)} x2={X(cursor)} y1={T} y2={H - B} stroke="#fbbf24" strokeWidth="2" />
    </svg>
  );
}
