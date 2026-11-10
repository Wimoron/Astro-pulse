'use client';

import { useMemo, useState } from 'react';
import type { SkyTarget } from '@/lib/catalog';
import { AstroLab } from './methods/AstroLab';
import { ImagingLab } from './methods/ImagingLab';
import { MicroLab } from './methods/MicroLab';
import { RvLab } from './methods/RvLab';

/** A search box that replaces a very long drop-down list. */
function StarPicker({ target, siblings, onPick }: { target: SkyTarget; siblings: SkyTarget[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (k ? siblings.filter((s) => s.name.toLowerCase().includes(k)) : siblings).slice(0, 40);
  }, [q, siblings]);
  return (
    <div className="relative w-full sm:w-[240px]">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="pill flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left">
        <span className="truncate normal-case tracking-normal"><span className="eyebrow mr-2 !text-[10px]">Star</span>{target.name}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="panel absolute right-0 z-30 mt-2 w-full min-w-[260px] rounded-xl p-2 shadow-2xl">
          <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${siblings.length.toLocaleString()} stars…`} aria-label="Search practice stars" className="glass-in min-h-10 w-full rounded-lg px-3 text-sm text-white placeholder:text-[#8da0c4]" />
          <ul role="listbox" aria-label="Practice stars" className="mt-2 max-h-64 overflow-y-auto">
            {list.length === 0 ? <li className="p-2 text-sm text-[#b3c0da]">No star with that name.</li> : null}
            {list.map((s) => (
              <li key={s.id} role="option" aria-selected={s.id === target.id}>
                <button type="button" onClick={() => { onPick(s.id); setOpen(false); setQ(''); }} className="min-h-10 w-full rounded-lg px-3 text-left text-sm text-white hover:bg-white/10">{s.name}</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Practice lab for every method except transit (transit has its own Lab). */
export function MethodLab({ target, siblings, onPick, onBack }: { target: SkyTarget; siblings: SkyTarget[]; onPick: (id: string) => void; onBack: () => void }) {
  const picker = <StarPicker target={target} siblings={siblings} onPick={onPick} />;
  const common = { target, onBack, picker };
  switch (target.method) {
    case 'rv': return <RvLab key={target.id} {...common} />;
    case 'imaging': return <ImagingLab key={target.id} {...common} />;
    case 'microlensing': return <MicroLab key={target.id} {...common} />;
    case 'astrometry': return <AstroLab key={target.id} {...common} />;
    default: return null;
  }
}
