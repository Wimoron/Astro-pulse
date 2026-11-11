import { API, NO_SERVER } from './api';
import type { HostRec } from './hosts';
import { isValidCurve } from './catalog';
import type { LightCurve } from './types';

export interface CatalogState {
  hosts: HostRec[];
  /** live = just fetched from NASA; saved = copy from an earlier visit; sample = the small built-in list. */
  source: 'live' | 'saved' | 'sample';
  updated: number;
  /** Names of stars that were not in the list on your last visit. */
  fresh: string[];
  error?: string;
}

const KEY = 'ap-catalog-v1';
const SEEN = 'ap-seen-v1';
const DAY = 24 * 3600 * 1000;

function load<T>(k: string): T | null {
  try {
    const s = localStorage.getItem(k);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}
function save(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage can be full or blocked */
  }
}

function newSince(hosts: HostRec[]): string[] {
  const seen = load<string[]>(SEEN);
  save(SEEN, hosts.map((h) => h.n));
  if (!seen) return [];
  const old = new Set(seen);
  return hosts.filter((h) => !old.has(h.n)).map((h) => h.n);
}

/** Tries NASA first, then your last saved copy, then the built-in sample. */
export async function loadCatalog(force = false): Promise<CatalogState> {
  const saved = load<{ at: number; hosts: HostRec[] }>(KEY);
  if (!force && saved && Date.now() - saved.at < DAY) {
    return { hosts: saved.hosts, source: 'saved', updated: saved.at, fresh: [] };
  }
  if (NO_SERVER) {
    const r = await fetch('sky/hosts.json');
    return { hosts: (await r.json()) as HostRec[], source: 'sample', updated: 0, fresh: [] };
  }
  try {
    const r = await fetch(`${API}/api/catalog`, { signal: AbortSignal.timeout(60000) });
    const j = (await r.json().catch(() => ({}))) as { hosts?: HostRec[]; generated?: number; error?: string };
    if (!r.ok) throw new Error(j.error ?? `server answered ${r.status}`);
    if (!j.hosts || j.hosts.length < 50) throw new Error('short');
    const fresh = newSince(j.hosts);
    save(KEY, { at: Date.now(), hosts: j.hosts });
    return { hosts: j.hosts, source: 'live', updated: j.generated ?? Date.now(), fresh };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'unknown';
    if (saved) return { hosts: saved.hosts, source: 'saved', updated: saved.at, fresh: [], error };
    const r = await fetch('sky/hosts.json');
    return { hosts: (await r.json()) as HostRec[], source: 'sample', updated: 0, fresh: [], error };
  }
}

/** Real TESS or Kepler data for the star, or null if there is none (or no server). */
export async function loadRealCurve(ra: number, dec: number): Promise<LightCurve | null> {
  if (NO_SERVER) return null;
  try {
    const r = await fetch(`${API}/api/lightcurve?ra=${ra}&dec=${dec}`, { signal: AbortSignal.timeout(90000) });
    if (!r.ok) return null;
    const j = (await r.json()) as unknown;
    return isValidCurve(j) ? (j as LightCurve) : null;
  } catch {
    return null;
  }
}
