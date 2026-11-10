import { lightCurveNear, type LiveResult } from '@/lib/mast';
import { inRange, limited, once, TtlCache } from '@/lib/serverutil';

const cache = new TtlCache<LiveResult | null>(150);
const DAY = 24 * 3600 * 1000;

/** Real TESS or Kepler brightness measurements for the star at ?ra=&dec= (degrees). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const ra = Number(u.searchParams.get('ra'));
  const dec = Number(u.searchParams.get('dec'));
  if (u.searchParams.get('ra') === null || u.searchParams.get('dec') === null || !inRange(ra, dec)) return Response.json({ error: 'ra (0-360) and dec (-90 to 90) needed' }, { status: 400 });
  if (limited(req, 'lc', 40)) return Response.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 });
  const key = `${ra.toFixed(3)},${dec.toFixed(3)}`;
  try {
    let hit = cache.get(key);
    if (!hit) {
      const v = await once(`lc:${key}`, () => lightCurveNear(ra, dec));
      // A star with no data is checked again after a day, in case new observations arrived.
      cache.set(key, v, v ? 7 * DAY : DAY);
      hit = { v };
    }
    if (!hit.v) return Response.json({ none: true }, { headers: { 'Cache-Control': 'public, s-maxage=3600' } });
    return Response.json(hit.v, { headers: { 'Cache-Control': 'public, s-maxage=86400' } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'unavailable' }, { status: 502 });
  }
}
