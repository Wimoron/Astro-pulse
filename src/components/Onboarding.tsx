'use client';

import { useState } from 'react';
import { Diagram } from './methods/ui';

const KEY = 'ap-onboarded-v1';
export function seenIntro(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true; // storage blocked: do not nag on every launch
  }
}
export function markIntro() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* blocked storage */
  }
}

const SLIDES = [
  { title: 'Planets hide in plain sight', body: 'Planets around other stars are far too faint to see. Astronomers find them by the clues they leave: a star that dims, wobbles or flashes.' },
  { title: 'Learn by doing', body: 'Pick a method, run a short lab, and measure a real planet yourself. Every lab explains each step in plain words.' },
  { title: 'Play every day', body: 'A new puzzle each day, plus real unconfirmed NASA candidates to judge. Earn ranks and badges. It is free, with no account, and your progress stays on your phone.' },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const s = SLIDES[i]!;
  const finish = () => {
    markIntro();
    onDone();
  };
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#050506] pt-[calc(1rem+var(--sat))] pb-[calc(1rem+var(--sab))]" role="dialog" aria-modal="true" aria-label="Welcome to AstroPulse">
      <div className="flex items-center justify-between px-5">
        <span className="font-heading text-[15px] font-extrabold uppercase tracking-[0.2em] text-white">Astro<span className="text-[#ff7a45]">Pulse</span></span>
        {!last ? <button type="button" onClick={finish} className="min-h-11 px-2 text-sm text-[#b4b4be]">Skip</button> : null}
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6">
        <div className="cell !p-4">{i === 0 ? <Diagram method="transit" caption={false} bare /> : i === 1 ? <Diagram method="rv" caption={false} bare /> : <Diagram method="microlensing" caption={false} bare />}</div>
        <div aria-live="polite">
          <h1 className="text-[30px] leading-9 text-white">{s.title}</h1>
          <p className="mt-3 text-[17px] leading-relaxed text-[#b4b4be]">{s.body}</p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-md px-6">
        <div className="mb-4 flex justify-center gap-2" aria-hidden="true">
          {SLIDES.map((_, k) => (
            <span key={k} className={`h-1.5 rounded-full ${k === i ? 'w-6 bg-white' : 'w-1.5 bg-white/25'}`} />
          ))}
        </div>
        <button type="button" className="pill-primary min-h-14 w-full" onClick={() => (last ? finish() : setI(i + 1))}>{last ? 'Get started' : 'Next'}</button>
      </div>
    </div>
  );
}
