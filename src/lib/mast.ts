import { curveFromFits, type LiveCurve } from './nasa';

const MAST = process.env.MAST_URL ?? 'https://mast.stsci.edu';
const TIMEOUT = 30000;

async function invoke(service: string, params: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
  const req = JSON.stringify({ service, params, format: 'json', pagesize: 200, page: 1 });
  const r = await fetch(`${MAST}/api/v0/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `request=${encodeURIComponent(req)}`,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!r.ok) throw new Error(`MAST ${service} answered ${r.status}`);
  const j = (await r.json()) as { data?: Array<Record<string, unknown>> };
  return j.data ?? [];
}

export interface LiveResult extends LiveCurve {
  source: string;
}

/** Finds a TESS (2-minute) or Kepler (long cadence) light curve near a sky position. */
export async function lightCurveNear(ra: number, dec: number): Promise<LiveResult | null> {
  const obs = await invoke('Mast.Caom.Cone', { ra, dec, radius: 0.004 });
  const series = obs.filter((o) => (o.obs_collection === 'TESS' || o.obs_collection === 'Kepler') && o.dataproduct_type === 'timeseries');
  const tess = series.filter((o) => o.obs_collection === 'TESS' && String(o.provenance_name ?? '').includes('SPOC') && Number(o.t_exptime ?? 120) <= 130);
  const kepler = series.filter((o) => o.obs_collection === 'Kepler');
  const order = [...tess.slice(0, 2), ...kepler.slice(0, 1)];
  for (const o of order) {
    const prods = await invoke('Mast.Caom.Products', { obsid: o.obsid });
    const want = o.obs_collection === 'TESS' ? '_lc.fits' : '_llc.fits';
    const file = prods.find((p) => String(p.productFilename ?? '').endsWith(want) && p.dataURI);
    if (!file) continue;
    const r = await fetch(`${MAST}/api/v0.1/Download/file?uri=${encodeURIComponent(String(file.dataURI))}`, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) continue;
    const curve = curveFromFits(new Uint8Array(await r.arrayBuffer()), o.obs_collection === 'TESS' ? 10 : 0);
    if (curve) return { ...curve, source: `${o.obs_collection} ${String(o.obs_id ?? file.productFilename)}` };
  }
  return null;
}

export interface Resolved {
  name: string;
  ra: number;
  dec: number;
  mag: number | null;
  tic: string | null;
  note: string;
}

const TAP = process.env.NASA_TAP_URL ?? 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';

async function tap(query: string): Promise<Array<Record<string, string>>> {
  const r = await fetch(`${TAP}?query=${encodeURIComponent(query)}&format=csv`, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'AstroPulse/1.0 (education)' } });
  if (!r.ok) throw new Error(`NASA answered ${r.status}`);
  const rows = (await r.text()).trim().split(/\r?\n/).map((l) => l.split(','));
  const head = rows.shift() ?? [];
  return rows.map((row) => Object.fromEntries(head.map((h, i) => [h.replace(/"/g, ''), (row[i] ?? '').replace(/"/g, '')])));
}

const f = (x: unknown): number | null => {
  const v = Number(x);
  return x !== null && x !== '' && x !== undefined && Number.isFinite(v) ? v : null;
};

function mk(name: string, ra: unknown, dec: unknown, mag: unknown, tic: string | null, note: string): Resolved | null {
  const a = f(ra);
  const d = f(dec);
  return a === null || d === null || a < 0 || a > 360 || d < -90 || d > 90 ? null : { name, ra: a, dec: d, mag: f(mag), tic, note };
}
const keep = (xs: Array<Resolved | null>): Resolved[] => xs.filter((x): x is Resolved => x !== null);

/** Turns a star name, a TIC number or a TOI number into a sky position. */
export async function resolveStar(q: string): Promise<Resolved[]> {
  const text = q.trim().slice(0, 60);
  const tic = /^TIC[\s-]*(\d{1,12})$/i.exec(text);
  if (tic) {
    const rows = await invoke('Mast.Catalogs.Filtered.Tic', { columns: 'ID,ra,dec,Tmag', filters: [{ paramName: 'ID', values: [tic[1]] }] });
    return keep(rows.map((r) => mk(`TIC ${String(r.ID)}`, r.ra, r.dec, r.Tmag, String(r.ID), 'TESS Input Catalog')));
  }
  const toi = /^TOI[\s-]*(\d{1,5})(?:\.\d+)?$/i.exec(text);
  if (toi) {
    const n = Number(toi[1]);
    const rows = await tap(`select toi,tid,ra,dec,st_tmag from toi where toi>=${n} and toi<${n + 1}`);
    return keep(rows.map((r) => mk(`TOI-${r.toi}`, r.ra, r.dec, r.st_tmag, r.tid || null, 'TESS planet candidate'))).slice(0, 5);
  }
  const req = JSON.stringify({ service: 'Mast.Name.Lookup', params: { input: text, format: 'json' }, format: 'json' });
  const r = await fetch(`${MAST}/api/v0/invoke`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `request=${encodeURIComponent(req)}`, signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(`MAST name lookup answered ${r.status}`);
  const j = (await r.json()) as { resolvedCoordinate?: Array<{ ra?: number; decl?: number; canonicalName?: string }> };
  return keep((j.resolvedCoordinate ?? []).map((c) => mk(c.canonicalName || text, c.ra, c.decl, null, null, 'Found by name'))).slice(0, 3);
}

export interface CandidateRec {
  toi: string;
  tic: string;
  ra: number;
  dec: number;
  mag: number | null;
  periodDays: number;
  durationHours: number;
  depthPpm: number;
  radiusEarth: number | null;
  status: string;
}

/** Bright, clearly visible TESS planet candidates that nobody has confirmed yet. */
export async function openCandidates(): Promise<CandidateRec[]> {
  const rows = await tap(
    "select toi,tid,ra,dec,st_tmag,pl_orbper,pl_trandurh,pl_trandep,pl_rade,tfopwg_disp from toi where tfopwg_disp in ('PC','APC') and st_tmag<12.5 and pl_orbper>0.6 and pl_orbper<13 and pl_trandep>1500 and pl_trandurh>0.5 order by st_tmag",
  );
  const out: CandidateRec[] = [];
  for (const r of rows) {
    const ra = f(r.ra), dec = f(r.dec), p = f(r.pl_orbper), d = f(r.pl_trandurh), dep = f(r.pl_trandep);
    if (ra === null || dec === null || p === null || d === null || dep === null || !r.toi || !r.tid) continue;
    out.push({ toi: r.toi, tic: r.tid, ra, dec, mag: f(r.st_tmag), periodDays: p, durationHours: d, depthPpm: dep, radiusEarth: f(r.pl_rade), status: r.tfopwg_disp });
  }
  return out.slice(0, 400);
}

/** NASA's current answer for the given TOI numbers (e.g. "700.01"). */
export async function dispositionsOf(tois: string[]): Promise<Record<string, string>> {
  const ids = tois.filter((t) => /^\d{1,5}\.\d{2}$/.test(t)).slice(0, 40);
  if (!ids.length) return {};
  const rows = await tap(`select toi,tfopwg_disp from toi where toi in (${ids.join(',')})`);
  const out: Record<string, string> = {};
  for (const r of rows) if (r.toi) out[Number(r.toi).toFixed(2)] = r.tfopwg_disp || 'PC';
  return out;
}
