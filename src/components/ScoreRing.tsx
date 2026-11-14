'use client';
/* eslint-disable react-hooks/set-state-in-effect -- the ring animates from 0 to the score after it appears */

import { useEffect, useState } from 'react';

/** Score as a ring that fills and a number that counts up. Respects reduced motion. */
export function ScoreRing({ value, color }: { value: number; color: string }) {
  const [shown, setShown] = useState(0);
  const [fill, setFill] = useState(0);
  useEffect(() => {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(value);
      setFill(value);
      return;
    }
    setFill(value);
    let n = 0;
    const step = Math.max(1, Math.round(value / 25));
    const t = setInterval(() => {
      n = Math.min(value, n + step);
      setShown(n);
      if (n >= value) clearInterval(t);
    }, 30);
    return () => clearInterval(t);
  }, [value]);
  return (
    <div className="relative mx-auto h-40 w-40" role="img" aria-label={`Score ${value} out of 100`}>
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="80" cy="80" r="70" fill="none" stroke="#1b1b22" strokeWidth="10" />
        <circle cx="80" cy="80" r="70" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray="440" strokeDashoffset={440 * (1 - fill / 100)} style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center font-mono text-[52px] font-bold text-white" aria-hidden="true">{shown}</div>
    </div>
  );
}
