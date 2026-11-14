'use client';

import { useMemo } from 'react';

const COLORS = ['#ffaa46', '#67e8f9', '#f472b6', '#a78bfa', '#4ade80', '#fbbf24'];

/** The "you found it" moment: confetti and a card for the simulated planet. */
export function FoundCard({ name, color, facts }: { name: string; color: string; facts: Array<[string, string]> }) {
  const bits = useMemo(() => Array.from({ length: 36 }, (_, i) => ({ left: (i * 37) % 100, delay: ((i * 13) % 6) / 10, dur: 1.4 + ((i * 7) % 12) / 10, c: COLORS[i % COLORS.length]! })), []);
  return (
    <section className="found panel relative overflow-hidden rounded-xl p-4" aria-label="Planet found" style={{ borderColor: `${color}66`, background: `linear-gradient(135deg, ${color}22, #0a0a0d 60%)` }}>
      <div className="confetti" aria-hidden="true">
        {bits.map((b, i) => <i key={i} style={{ left: `${b.left}%`, background: b.c, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s` }} />)}
      </div>
      <div className="eyebrow text-center" style={{ color: '#ffaa46' }}>✦ New world found ✦</div>
      <div className="found-ball mx-auto my-3 h-20 w-20 rounded-full" aria-hidden="true" style={{ background: `radial-gradient(circle at 30% 25%, #ffffff, ${color} 45%, #14202c 80%)`, boxShadow: `inset -10px -8px 16px rgba(0,0,0,.35), 0 0 26px ${color}55` }} />
      <div className="text-center font-heading text-lg font-extrabold text-white">{name}</div>
      <div className="mt-0.5 text-center text-xs text-[#8a8a96]">A practice planet from simulated data</div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {facts.map(([k, v]) => <div key={k} className="cell"><div className="k">{k}</div><div className="v">{v}</div></div>)}
      </div>
    </section>
  );
}
