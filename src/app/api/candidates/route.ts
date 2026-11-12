import { dispositionsOf, openCandidates, type CandidateRec } from '@/lib/mast';
import { limited, once, TtlCache } from '@/lib/serverutil';

const list = new TtlCache<CandidateRec[]>(2);
const status = new TtlCache<Record<string, string>>(100);

/** No query: open (unconfirmed) TESS candidates. ?ids=700.01,1000.01: NASA's current answer for those. */
export async function GET(req: Request) {
  if (limited(req, 'cand', 30)) return Response.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 });
  const ids = new URL(req.url).searchParams.get('ids');
  try {
    if (ids !== null) {
      const tois = ids.split(',').map((s) => s.trim()).filter(Boolean);
      if (!tois.length || tois.length > 40 || tois.some((t) => !/^\d{1,5}\.\d{2}$/.test(t))) return Response.json({ error: 'ids must be TOI numbers like 700.01' }, { status: 400 });
      const key = [...tois].sort().join(',');
      let hit = status.get(key);
      if (!hit) {
        hit = { v: await once(`cs:${key}`, () => dispositionsOf(tois)) };
        status.set(key, hit.v, 3600000);
      }
      return Response.json({ status: hit.v }, { headers: { 'Cache-Control': 'public, s-maxage=1800' } });
    }
    let hit = list.get('open');
    if (!hit) {
      hit = { v: await once('cand', openCandidates) };
      if (hit.v.length) list.set('open', hit.v, 6 * 3600000);
    }
    if (!hit.v.length) return Response.json({ error: 'NASA returned no candidates right now.' }, { status: 502 });
    return Response.json({ candidates: hit.v }, { headers: { 'Cache-Control': 'public, s-maxage=3600' } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'unavailable' }, { status: 502 });
  }
}
