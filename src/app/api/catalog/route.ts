import { catalogFromCsv, TAP_COLUMNS, TAP_OPTIONAL } from '@/lib/nasa';
import { limited, once } from '@/lib/serverutil';

const TAP = process.env.NASA_TAP_URL ?? 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';
const TTL = 6 * 3600 * 1000;
let cache: { at: number; body: string } | null = null;

async function refresh() {
  const ask = (cols: string) =>
    fetch(`${TAP}?query=${encodeURIComponent(`select ${cols} from pscomppars`)}&format=csv`, { signal: AbortSignal.timeout(45000), headers: { 'User-Agent': 'AstroPulse/1.0 (education)', Accept: 'text/csv,*/*' } });
  // Optional columns may be renamed by NASA one day: drop whichever one it rejects and ask again.
  const optional = TAP_OPTIONAL.split(',');
  let r = await ask([TAP_COLUMNS, ...optional].join(','));
  for (let i = 0; i < 6 && r.status === 400; i++) {
    const msg = await r.text();
    const bad = optional.find((c) => msg.toLowerCase().includes(c.toLowerCase()));
    if (bad) optional.splice(optional.indexOf(bad), 1);
    else optional.length = 0;
    r = await ask([TAP_COLUMNS, ...optional].join(','));
  }
  if (!r.ok) throw new Error(`NASA answered ${r.status} ${(await r.text()).replace(/<[^>]+>/g, ' ').slice(0, 160).trim()}`);
  const hosts = catalogFromCsv(await r.text());
  if (hosts.length < 50) throw new Error('NASA sent an empty list');
  cache = { at: Date.now(), body: JSON.stringify({ generated: Date.now(), source: 'NASA Exoplanet Archive', hosts }) };
}

/** Live list of every known planet host, straight from the NASA Exoplanet Archive. */
export async function GET(req: Request) {
  if (limited(req, 'cat', 20)) return Response.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 });
  try {
    if (!cache || Date.now() - cache.at > TTL) {
      await once('catalog', refresh);
    }
    if (!cache) throw new Error('no data');
    return new Response(cache.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
  } catch (e) {
    if (cache) return new Response(cache.body, { headers: { 'Content-Type': 'application/json' } });
    const c = e instanceof Error ? (e.cause as { code?: string; message?: string } | undefined) : undefined;
    const msg = e instanceof Error ? `${e.message}${c ? ` (${c.code ?? c.message})` : ''}` : 'unavailable';
    console.error('[catalog]', msg);
    return Response.json({ error: msg }, { status: 502 });
  }
}
