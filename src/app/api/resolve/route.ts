import { resolveStar, type Resolved } from '@/lib/mast';
import { limited, once, TtlCache } from '@/lib/serverutil';

const cache = new TtlCache<Resolved[]>(300);

/** Finds the sky position of a star from its name, a TIC number or a TOI number. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (q.length < 2 || q.length > 60 || /[<>{}\\]/.test(q)) return Response.json({ error: 'Type a star name, a TIC number or a TOI number.' }, { status: 400 });
  if (limited(req, 'resolve', 20)) return Response.json({ error: 'Too many lookups. Try again in a minute.' }, { status: 429 });
  const key = q.toLowerCase().replace(/\s+/g, ' ');
  try {
    let hit = cache.get(key);
    if (!hit) {
      const v = await once(`rs:${key}`, () => resolveStar(q));
      cache.set(key, v, v.length ? 7 * 24 * 3600000 : 3600000);
      hit = { v };
    }
    return Response.json({ results: hit.v });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'unavailable' }, { status: 502 });
  }
}
