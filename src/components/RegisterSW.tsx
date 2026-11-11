'use client';

import { useEffect } from 'react';

/** Lets the app install to the home screen and open without a connection. */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
