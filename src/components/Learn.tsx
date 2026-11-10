'use client';

import { METHODS, type Method } from '@/lib/methods';
import { Diagram } from './methods/ui';

const ORDER: Method[] = ['transit', 'rv', 'imaging', 'microlensing', 'astrometry'];
const INFO: Record<Method, { sees: string; best: string; limit: string }> = {
  transit: { sees: 'A small, regular dip in a star’s brightness.', best: 'Finds planets of every size close to their star, and tells you how wide they are.', limit: 'The orbit must happen to line up edge-on. Most do not.' },
  rv: { sees: 'A repeating shift in the colour of the star’s light.', best: 'Tells you how heavy the planet is (at least).', limit: 'Small planets far from their star pull too gently to detect.' },
  imaging: { sees: 'The planet itself, as a faint dot in a photo.', best: 'Shows big, young, far-out planets directly, and lets you study their light.', limit: 'Needs the star’s glare removed. Only the easiest planets can be seen.' },
  microlensing: { sees: 'A brief extra flash on top of a smooth brightening.', best: 'Finds cold, small planets thousands of light-years away.', limit: 'It happens once. You cannot look again.' },
  astrometry: { sees: 'A tiny circle traced by the star on the sky.', best: 'Gives a planet’s true weight and works for far-out giants.', limit: 'The circles are incredibly small, so few planets are found yet.' },
};

function Planet() {
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" role="img" aria-label="">
      <defs>
        <filter id="gas" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.055" numOctaves="5" seed="11" />
          <feColorMatrix type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" />
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0.22 0.62 0.9 1" />
            <feFuncG type="table" tableValues="0.04 0.16 0.38 0.62" />
            <feFuncB type="table" tableValues="0.03 0.07 0.13 0.25" />
          </feComponentTransfer>
        </filter>
        <clipPath id="orb"><circle cx="200" cy="200" r="150" /></clipPath>
        <radialGradient id="shade" cx="34%" cy="32%" r="78%">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="0.55" stopColor="#000" stopOpacity="0.15" />
          <stop offset="0.85" stopColor="#000" stopOpacity="0.8" />
          <stop offset="1" stopColor="#000" stopOpacity="0.96" />
        </radialGradient>
        <radialGradient id="halo" cx="50%" cy="50%" r="50%">
          <stop offset="0.7" stopColor="#ff6a3d" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ff6a3d" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="198" fill="url(#halo)" />
      <g clipPath="url(#orb)">
        <rect x="50" y="50" width="300" height="300" filter="url(#gas)" />
        <rect x="50" y="50" width="300" height="300" fill="url(#shade)" />
      </g>
      <circle cx="200" cy="200" r="150" fill="none" stroke="rgba(255,255,255,0.12)" />
    </svg>
  );
}

export function Learn({ onPractice, onSky, onCatalog, counts, total, status }: { onPractice: (m: Method) => void; onSky: () => void; onCatalog: () => void; counts: Record<Method, number>; total: number; status: { source: 'live' | 'saved' | 'sample'; updated: number; fresh: number; error?: string } | null }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 md:px-8">
      {/* Hero */}
      <section className="relative grid items-center gap-10 py-10 md:min-h-[620px] md:grid-cols-[minmax(0,6fr)_minmax(0,6fr)_minmax(0,4fr)] md:gap-0 md:py-14" aria-labelledby="learn-title">
        <div className="relative z-10">
          <div className="rise flex flex-wrap items-center gap-3" style={{ animationDelay: '0.05s' }}>
            {status ? (
              <button type="button" onClick={onCatalog} className="pill flex min-h-9 items-center gap-2 px-3 !text-[11px]" title={status.error ?? 'Open the star catalog'}>
                <span className={`h-2 w-2 rounded-full ${status.source === 'live' ? 'bg-[#4ade80]' : status.source === 'saved' ? 'bg-[#fbbf24]' : 'bg-[#f87171]'}`} />
                {status.source === 'live' ? 'Live from NASA' : status.source === 'saved' ? 'Saved NASA copy' : 'Offline sample'} · {total.toLocaleString()} stars
                {status.fresh ? ` · ${status.fresh} new` : ''}
              </button>
            ) : null}
            {status?.error ? <span className="max-w-xs text-[11px] leading-snug text-[#fca5a5]">NASA could not be reached: {status.error}</span> : null}
          </div>
          <h1 id="learn-title" className="rise mt-6 text-[clamp(34px,4.4vw,60px)] leading-[1.02] text-white" style={{ animationDelay: '0.15s' }}>
            Find the<br />worlds you<br />cannot see.
          </h1>
          <p className="rise mt-6 max-w-sm text-[15px] leading-relaxed text-[#b4b4be]" style={{ animationDelay: '0.3s' }}>
            Planets around other stars are too faint to spot. Astronomers read the clues they leave behind. Pick a clue, practice, and measure a real planet yourself. No code.
          </p>
          <div className="rise mt-8 flex flex-wrap gap-3 [&>button]:whitespace-nowrap" style={{ animationDelay: '0.45s' }}>
            <button type="button" onClick={() => onPractice('transit')} className="pill-primary min-h-12 px-7">Start with the easiest</button>
            <button type="button" onClick={onSky} className="pill min-h-12 px-6">Open sky map</button>
          </div>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[520px] md:-mx-8" aria-hidden="true">
          <Planet />
        </div>

        <ul className="relative z-10 flex flex-col gap-1 md:-ml-14" aria-label="The five methods">
          {ORDER.map((m) => (
            <li key={m}>
              <button type="button" onClick={() => onPractice(m)} className="group flex w-full items-center gap-3 py-2.5 text-left">
                <span className="hidden h-px flex-1 bg-white/35 transition-all group-hover:bg-white md:block" />
                <span className="min-w-[150px] md:min-w-0 md:w-[170px]">
                  <span className="block text-[15px] font-semibold leading-tight text-white group-hover:underline">{METHODS[m].name.replace(/ \(.*\)/, '')}</span>
                  <span className="eyebrow !text-[10px]">{counts[m].toLocaleString()} stars</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Methods */}
      <section aria-labelledby="pick">
        <div className="eyebrow">Choose a method</div>
        <h2 id="pick" className="mt-1 text-3xl text-white md:text-4xl">Ten minutes each. One real planet at the end.</h2>

        {/* Featured: the easiest method, wide */}
        {(() => {
          const m: Method = 'transit';
          const c = METHODS[m].color;
          return (
            <article className="glass card-lift mt-7 grid overflow-hidden rounded-xl md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" style={{ ['--c' as string]: c }}>
              <div className="relative grid place-items-center bg-[radial-gradient(circle_at_50%_40%,rgba(103,232,249,.14),transparent_70%)] p-8 md:p-10">
                <span className="eyebrow absolute left-5 top-5 rounded bg-white px-2.5 py-1 !text-[#050506]">Start here</span>
                <div className="w-full max-w-[300px]"><Diagram method={m} caption={false} bare /></div>
              </div>
              <div className="flex flex-col p-6 md:p-9">
                <div className="eyebrow">01 · {counts[m].toLocaleString()} stars found this way</div>
                <h3 className="mt-2 text-4xl md:text-5xl" >{METHODS[m].name}</h3>
                <p className="mt-3 text-lg font-medium text-white">{METHODS[m].oneLine}</p>
                <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
                  {([['You look at', INFO[m].sees], ['Good at', INFO[m].best], ['The catch', INFO[m].limit]] as const).map(([k, v]) => (
                    <div key={k}><dt className="eyebrow">{k}</dt><dd className="mt-1 text-[#c9d5ee]">{v}</dd></div>
                  ))}
                </dl>
                <div className="mt-auto pt-7"><button type="button" onClick={() => onPractice(m)} className="pill-primary min-h-12 px-8 text-base">Practice this method →</button></div>
              </div>
            </article>
          );
        })()}

        {/* The other four: equal cards, same structure */}
        <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {ORDER.slice(1).map((m, i) => (
            <article key={m} className="glass card-lift flex flex-col overflow-hidden rounded-xl" style={{ ['--c' as string]: METHODS[m].color }}>
              <div className="relative grid place-items-center px-6 pb-2 pt-6" style={{ background: `radial-gradient(circle at 50% 45%, ${METHODS[m].color}22, transparent 70%)` }}>
                <span className="eyebrow absolute left-5 top-5">0{i + 2}</span>
                <div className="w-full max-w-[190px]"><Diagram method={m} caption={false} bare /></div>
              </div>
              <div className="flex flex-1 flex-col p-5 pt-3">
                <h3 className="text-[26px]">{METHODS[m].name}</h3>
                <div className="eyebrow mt-2">{counts[m].toLocaleString()} stars found this way</div>
                <p className="mt-3 font-medium text-white">{METHODS[m].oneLine}</p>
                <p className="mt-2 text-sm text-[#c9d5ee]"><span className="eyebrow mr-2">Catch</span>{INFO[m].limit}</p>
                <div className="mt-auto pt-5"><button type="button" onClick={() => onPractice(m)} className="pill-primary min-h-12 w-full px-4 text-[15px]">Practice →</button></div>
              </div>
            </article>
          ))}
        </div>

        {/* Slim footer strip instead of a sixth card */}
        <div className="glass-in mt-5 flex flex-col items-start justify-between gap-3 rounded-xl p-5 sm:flex-row sm:items-center">
          <p className="max-w-2xl text-sm text-[#c9d5ee]"><b className="text-white">Also exists: timing tricks.</b> A few planets were found because a star’s pulses or dips arrive a little early or late. They are rare, so they have no lab yet. They are in the catalog.</p>
          <button type="button" onClick={onCatalog} className="pill min-h-11 shrink-0 px-5 font-semibold">Browse all {total.toLocaleString()} stars →</button>
        </div>
      </section>
    </div>
  );
}
