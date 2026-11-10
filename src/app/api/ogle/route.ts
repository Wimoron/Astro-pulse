import { limited, once, TtlCache } from '@/lib/serverutil';

const BASE = process.env.OGLE_URL ?? 'https://www.astrouw.edu.pl/ogle/ogle4/ews';
const cache = new TtlCache<{ hjd: number[]; mag: number[]; err: number[] } | null>(100);

/** Real OGLE-IV photometry of a microlensing event (2011 and later). Always answers 200. */
export async function GET(req: Request) {
  const ev = (new URL(req.url).searchParams.get('event') ?? '').trim().toUpperCase();
  const m = /^OGLE-(20\d\d)-BLG-(\d{4})$/.exec(ev);
  if (!m || Number(m[1]) < 2011) return Response.json({ none: true, reason: 'OGLE-IV data exists only for events from 2011.' });
  if (limited(req, 'ogle', 20)) return Response.json({ error: 'Too many requests.' }, { status: 429 });
  let hit = cache.get(ev);
  if (!hit) {
    const v = await once(`og:${ev}`, async () => {
      try {
        const r = await fetch(`${BASE}/${m[1]}/blg-${m[2]}/phot.dat`, { signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'AstroPulse/1.0 (education)' } });
        if (!r.ok) return null;
        const hjd: number[] = [], mag: number[] = [], err: number[] = [];
        for (const line of (await r.text()).split(/\r?\n/)) {
          const p = line.trim().split(/\s+/).map(Number);
          if (p.length < 3 || p.some((x) => !Number.isFinite(x))) continue;
          const [h, g, e] = p as [number, number, number];
          if (g < 5 || g > 25 || e <= 0 || e > 0.3) continue;
          hjd.push(h < 100000 ? h + 2450000 : h);
          mag.push(g);
          err.push(e);
        }
        if (hjd.length < 100) return null;
        const step = Math.ceil(hjd.length / 1500);
        const pick = <T,>(a: T[]) => a.filter((_, i) => i % step === 0);
        return { hjd: pick(hjd), mag: pick(mag), err: pick(err) };
      } catch {
        return null;
      }
    });
    cache.set(ev, v, v ? 7 * 24 * 3600000 : 3600000);
    hit = { v };
  }
  return hit.v ? Response.json(hit.v) : Response.json({ none: true, reason: 'No OGLE data found for this event.' });
}
