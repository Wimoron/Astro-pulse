/** Small helpers that keep the API routes safe on a public server. */

/** A cache that forgets old entries and never grows past `max`. */
export class TtlCache<V> {
  private m = new Map<string, { at: number; ttl: number; v: V }>();
  constructor(private max: number) {}
  get(k: string): { v: V } | undefined {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (Date.now() - e.at > e.ttl) {
      this.m.delete(k);
      return undefined;
    }
    this.m.delete(k); // refresh recency
    this.m.set(k, e);
    return { v: e.v };
  }
  set(k: string, v: V, ttlMs: number) {
    this.m.delete(k);
    this.m.set(k, { at: Date.now(), ttl: ttlMs, v });
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string);
  }
  get size() {
    return this.m.size;
  }
}

const inflight = new Map<string, Promise<unknown>>();
/** If the same job is already running, share it instead of starting another. */
export function once<T>(key: string, job: () => Promise<T>): Promise<T> {
  const have = inflight.get(key) as Promise<T> | undefined;
  if (have) return have;
  const p = job().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

const hits = new Map<string, number[]>();
/** True when this caller has used up its allowance for the window. */
export function limited(req: Request, bucket: string, max: number, windowMs = 60000): boolean {
  const ip = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0]!.trim();
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return true;
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) for (const k of hits.keys()) { if (hits.size <= 2500) break; hits.delete(k); }
  return false;
}

export const inRange = (ra: number, dec: number) => Number.isFinite(ra) && Number.isFinite(dec) && ra >= 0 && ra <= 360 && Math.abs(dec) <= 90;
