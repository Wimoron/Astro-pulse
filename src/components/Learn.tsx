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

const TAG: Record<Method, { tag: string; foot: string }> = {
  transit: { tag: 'Transit photometry', foot: 'Edge-on orbits' },
  rv: { tag: 'Doppler spec', foot: 'Mass & minimum orbit' },
  imaging: { tag: 'Coronagraphy', foot: 'Young & wide orbiters' },
  microlensing: { tag: 'Relativity lens', foot: 'Deep galactic core' },
  astrometry: { tag: '2D position grid', foot: 'Precise star wobble' },
};

function Hero({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="hero-planet.jpg" alt="" className="h-full w-full object-cover object-top" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#050506] via-transparent to-transparent" />
      <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[#050506] to-transparent" />
      <div className="hud absolute inset-0 flex flex-col justify-between p-3 opacity-80">
        <div className="flex justify-between"><span>FIELD OF VIEW</span><span>FOV 24° × 24°</span></div>
        <div className="flex justify-between"><span>TARGET: HD 209458 b</span><span>22h 03m · +18°53′</span></div>
      </div>
    </div>
  );
}

export function Learn({ onPractice, onSky, onCatalog, counts, total, status }: { onPractice: (m: Method) => void; onSky: () => void; onCatalog: () => void; counts: Record<Method, number>; total: number; status: { source: 'live' | 'saved' | 'sample'; updated: number; fresh: number; error?: string } | null }) {
  return (
    <div className="mx-auto max-w-6xl pb-10 md:px-8 md:pb-16">
      {/* Hero */}
      <section className="relative grid items-center md:min-h-[620px] md:grid-cols-[minmax(0,6fr)_minmax(0,6fr)_minmax(0,4fr)] md:py-14" aria-labelledby="learn-title">
        <div className="relative z-10 px-4 pt-4 md:px-0 md:pt-0">
          {status ? (
            <button type="button" onClick={onCatalog} className="mb-4 inline-flex min-h-9 items-center gap-2 rounded-full bg-[#14141a] px-3 py-1.5 hud !text-[11px] !tracking-[0.12em] uppercase text-white" title={status.error ?? 'Open the star catalog'}>
              <span className="relative flex h-2 w-2">
                {status.source === 'live' ? <span className="ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /> : null}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${status.source === 'live' ? 'bg-emerald-500' : status.source === 'saved' ? 'bg-[#fbbf24]' : 'bg-[#f87171]'}`} />
              </span>
              {status.source === 'live' ? 'Live from NASA' : status.source === 'saved' ? 'Saved NASA copy' : 'Built-in sample'} · {total.toLocaleString()} stars{status.fresh ? ` · ${status.fresh} new` : ''}
            </button>
          ) : null}
          {status?.error ? <p className="mb-3 text-[11px] leading-snug text-[#fca5a5]">NASA could not be reached: {status.error}</p> : null}
          <h1 id="learn-title" className="text-[32px] leading-[38px] tracking-tight text-white md:text-[clamp(34px,4.4vw,60px)] md:leading-[1.02]">
            Find the worlds you cannot see.
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-[#b4b4be]">
            Planets around other stars are too faint to spot. Astronomers read the clues they leave behind. Pick a clue, practise, and measure a real planet yourself.
          </p>
          <div className="mt-5 flex flex-col gap-2.5 md:flex-row">
            <button type="button" onClick={() => onPractice('transit')} className="pill-primary min-h-12 w-full px-7 md:w-auto">Start with the easiest</button>
            <button type="button" onClick={onSky} className="pill min-h-12 w-full bg-[#0e0e14] px-6 md:w-auto">Open sky map</button>
          </div>
        </div>

        <Hero className="mt-5 h-52 w-full md:mx-auto md:mt-0 md:-mx-8 md:aspect-square md:h-auto md:max-w-[520px] md:rounded-full" />

        <ul className="relative z-10 hidden flex-col gap-1 md:-ml-14 md:flex" aria-label="The five methods">
          {ORDER.map((m) => (
            <li key={m}>
              <button type="button" onClick={() => onPractice(m)} className="group flex w-full items-center gap-3 py-2.5 text-left">
                <span className="h-px flex-1 bg-white/35 transition-all group-hover:bg-white" />
                <span className="w-[170px]">
                  <span className="block text-[15px] font-semibold leading-tight text-white group-hover:underline">{METHODS[m].name.replace(/ \(.*\)/, '')}</span>
                  <span className="eyebrow !text-[10px]">{counts[m].toLocaleString()} stars</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Methods */}
      <section aria-labelledby="pick" className="px-4 md:px-0">
        <div className="flex items-baseline justify-between"><span className="eyebrow">Choose a method</span><span className="hud">5 methods</span></div>
        <h2 id="pick" className="mt-1 text-2xl leading-tight text-white md:text-4xl">Ten minutes each. One real planet at the end.</h2>

        {/* Featured: the easiest method */}
        {(() => {
          const m: Method = 'transit';
          const c = METHODS[m].color;
          return (
            <article className="panel mt-5 grid overflow-hidden rounded-xl md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" style={{ ['--c' as string]: c }}>
              <div className="order-2 p-4 pt-0 md:order-1 md:grid md:place-items-center md:p-8">
                <div className="cell w-full max-w-[320px] !p-3 mx-auto"><Diagram method={m} caption={false} bare /></div>
              </div>
              <div className="order-1 flex flex-col p-4 md:order-2 md:p-8">
                <div className="flex items-center justify-between gap-2">
                  <span className="chip plain !bg-white !text-[#050506] !border-white">Start here</span>
                  <span className="hud !text-[var(--c)] uppercase">{TAG[m].tag}</span>
                </div>
                <h3 className="mt-3 text-[22px] leading-7 md:text-4xl">{METHODS[m].name === 'Transit' ? 'Watch a star dim as a planet crosses it' : METHODS[m].name}</h3>
                <dl className="mt-4 grid gap-2 text-sm">
                  {([['You look at', INFO[m].sees], ['Good at', INFO[m].best], ['The catch', INFO[m].limit]] as const).map(([k, v]) => (
                    <div key={k} className="cell"><dt className="k">{k}</dt><dd className="mt-1 text-[13px] leading-snug text-[#c9c9d2]">{v}</dd></div>
                  ))}
                </dl>
                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3"><span className="eyebrow">Found this way</span><span className="font-mono text-[13px] text-white">{counts[m].toLocaleString()} stars</span></div>
                <button type="button" onClick={() => onPractice(m)} className="pill-primary mt-4 min-h-12 w-full px-6">Practise this method →</button>
              </div>
            </article>
          );
        })()}

        <div className="eyebrow mt-7">Other ways to find planets</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ORDER.slice(1).map((m) => (
            <article key={m} className="panel flex flex-col rounded-xl p-4" style={{ ['--c' as string]: METHODS[m].color }}>
              <div className="flex items-center justify-between gap-2">
                <span className="chip">{TAG[m].tag}</span>
                <span className="hud !text-[var(--c)] uppercase">{counts[m].toLocaleString()} stars</span>
              </div>
              <h3 className="mt-3 text-xl">{METHODS[m].name}</h3>
              <div className="cell mt-3 !p-2"><div className="mx-auto w-full max-w-[200px]"><Diagram method={m} caption={false} bare /></div></div>
              <p className="mt-3 text-[13px] leading-snug text-[#b4b4be]">{METHODS[m].oneLine}</p>
              <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                <span className="eyebrow !text-[10px] leading-tight">{TAG[m].foot}</span>
                <button type="button" onClick={() => onPractice(m)} className="pill min-h-10 shrink-0 px-4 !text-[11px]">Practise</button>
              </div>
            </article>
          ))}
        </div>

        <div className="panel mt-3 flex flex-col items-start justify-between gap-3 rounded-xl p-4 sm:flex-row sm:items-center">
          <p className="max-w-2xl text-[13px] leading-snug text-[#b4b4be]"><b className="text-white">Also exists: timing tricks.</b> A few planets were found because a star’s pulses or dips arrive a little early or late. They are rare, so there is no lab yet. They are in the catalog.</p>
          <button type="button" onClick={onCatalog} className="pill min-h-11 w-full shrink-0 px-5 sm:w-auto">Browse all {total.toLocaleString()} stars →</button>
        </div>
      </section>
    </div>
  );
}
