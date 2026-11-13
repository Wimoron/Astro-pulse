'use client';

import { useEffect } from 'react';

/** Lets the app install to the home screen and open without a connection. */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_STATIC !== '1' && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
