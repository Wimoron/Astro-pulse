'use client';

import { useState } from 'react';
import { shareCard } from '@/lib/card';
import { METHODS } from '@/lib/methods';
import type { Discovery } from '@/lib/progress';

/** "Discovery confirmed": the planet you just worked out, with a picture to share. */
export function DiscoveryCard({ d, onNext, nextLabel = 'Explore the next planet' }: { d: Pick<Discovery, 'name' | 'method' | 'facts'>; onNext?: () => void; nextLabel?: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const m = METHODS[d.method];
  const share = async () => {
    try {
      const r = await shareCard({ kicker: 'Discovery confirmed', title: `I found ${d.name}`, facts: d.facts.length ? d.facts : [['Method', m.short]], color: m.color, footer: `Found with AstroPulse · ${m.short} method` }, `astropulse-${d.name.replace(/\W+/g, '-').toLowerCase()}.png`);
      setMsg(r === 'saved' ? 'Picture saved to your downloads.' : null);
    } catch {
      setMsg('Could not make the picture. Try again.');
    }
  };
  return (
    <section className="panel rounded-xl p-4" aria-label="Discovery confirmed">
      <span className="chip" style={{ ['--c' as string]: m.color }}>Discovery confirmed</span>
      <h2 className="mt-3 text-[28px] leading-tight text-white">You found {d.name}.</h2>
      <p className="mt-1 text-[15px] text-[#b4b4be]">Added to your collection in My log.</p>
      {d.facts.length ? (
        <dl className="mt-3 grid grid-cols-2 gap-2">
          {d.facts.map(([k, v]) => (
            <div key={k} className="cell"><dt className="k">{k}</dt><dd className="v">{v}</dd></div>
          ))}
        </dl>
      ) : null}
      <div className="mt-4 grid gap-2">
        <button type="button" className="pill-primary min-h-12" onClick={share}>Share discovery card</button>
        {onNext ? <button type="button" className="pill min-h-12" onClick={onNext}>{nextLabel}</button> : null}
      </div>
      {msg ? <p className="mt-2 text-sm text-[#b4b4be]" role="status">{msg}</p> : null}
    </section>
  );
}
