import { type SkyTarget, type PlanetInfo } from './catalog';
import type { SimSpec } from './simulate';
import { EARTH_PER_MJ, imagingGeometry, METHODS, type Method } from './methods';

/** One row of public/sky/hosts.json. */
export interface HostRec {
  n: string;
  ra: number;
  dec: number;
  m: number | null;
  t: Method | 'other';
  pl: string;
  p: number | null;
  r: number | null;
  mj: number | null;
  a: number | null;
  d: number | null;
  sm: number | null;
  te: number | null;
  y: number;
  /** TESS Input Catalog id, planets known around the star, discovery site, date added to the archive, original method name. */
  tic?: string | null;
  np?: number;
  fac?: string | null;
  rd?: string | null;
  om?: string | null;
  /** Mid-transit time (BJD), transit length (hours), star radius (Suns): used to predict transits. */
  tm?: number | null;
  td?: number | null;
  sr?: number | null;
}

export const hostId = (h: Pick<HostRec, 'n' | 'pl'>): string => slug(`${h.n}-${h.pl}`);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const GAP = (days: number): [number, number] => [days * 0.5 - 0.4, days * 0.5 + 0.4];

/** A transit stand-in: depth and length come from the real planet size, period and star. */
function transitSpec(h: HostRec, star: { radiusSun: number; massSun: number; teffK: number }, id: string): { spec: SimSpec; period: number } | null {
  const P = h.p;
  if (!P || P > 45) return null;
  const rE = h.r ?? (h.mj ? Math.max(1, 11 * Math.sqrt(h.mj)) : 2);
  const rp = rE * 0.009168; // in solar radii
  const depth = Math.min(0.03, (rp / star.radiusSun) ** 2);
  const aAU = Math.cbrt(star.massSun * (P / 365.25) ** 2);
  const dur = Math.min(0.5, Math.max(0.03, (P / Math.PI) * ((star.radiusSun * 0.00465) / aAU)));
  const days = Math.min(144, Math.max(27.4, P * 3.2));
  const cad = 10;
  const nTr = Math.max(1, Math.floor(days / P));
  const ptsPer = dur / (cad / 1440);
  const mag = h.m ?? 11;
  let noise = Math.min(0.004, Math.max(0.0002, 0.0003 * Math.pow(10, 0.14 * (mag - 9))));
  // Keep the stand-in findable: real surveys only list planets they actually detected.
  const snrTarget = 10;
  if ((depth / noise) * Math.sqrt(nTr * ptsPer) < snrTarget) noise = (depth * Math.sqrt(nTr * ptsPer)) / snrTarget;
  const hs = hash(id);
  let t0 = 0.3 + (((hs >> 8) % 1000) / 1000) * Math.min(P, 6);
  // Keep the last dip a little way from the end of the data (a dip on the very edge is hard to clean).
  const tail = days - (t0 + Math.floor((days - t0) / P) * P);
  if (tail < 3 * dur) t0 = Math.max(2 * dur, t0 - (3 * dur - tail));
  const cool = star.teffK < 3800;
  const spec: SimSpec = {
    seed: hs % 100000,
    days,
    cadenceMin: cad,
    noise,
    rotationDays: cool ? 3 + (hs % 40) / 10 : 6 + (hs % 80) / 10,
    variability: Math.min(0.004, noise * 1.6 + 0.0008),
    flares: cool ? 3 : 0,
    gap: days <= 30 ? GAP(days) : null,
    transits: [{ period: P, t0, depth, duration: dur }],
  };
  return { spec, period: P };
}

const TAG: Record<Method, (h: HostRec, p: PlanetInfo) => string> = {
  transit: (h) => `Found by watching ${h.n} dim as a planet crosses in front`,
  rv: (h) => `Found because ${h.n} wobbles back and forth`,
  imaging: (h) => `A planet you can actually photograph around ${h.n}`,
  microlensing: (h) => `Found by a flash of extra light as ${h.n} passed in front of a far star`,
  astrometry: (h) => `Found by the tiny circle ${h.n} traces on the sky`,
};

export function hostToTarget(h: HostRec & { t: Method }): SkyTarget {
  const id = hostId(h);
  const sm = h.sm ?? 1;
  const star = { massSun: sm, radiusSun: Math.max(0.1, Math.pow(sm, sm > 1 ? 0.8 : 0.9)), teffK: h.te ?? 5000 };
  let period = h.p;
  if (!period && h.a && sm) period = Math.sqrt(h.a ** 3 / sm) * 365.25;
  const planet: PlanetInfo = { label: h.y === 0 ? h.n : `${h.n} ${h.pl}`, periodDays: period, radiusEarth: h.r, massJup: h.mj, sepAU: h.a, distLy: h.d, starMass: sm, year: h.y, tic: h.tic ?? null, nPlanets: h.np ?? 1, facility: h.fac ?? null, released: h.rd ?? null };
  const practice = h.y === 0;
  const mag = h.m ?? 12;
  let standIn: SimSpec | null = null;
  let difficulty: SkyTarget['difficulty'] = 'medium';
  if (h.t === 'transit') {
    const t = transitSpec(h, star, id);
    standIn = t?.spec ?? null;
    const depth = t?.spec.transits[0]?.depth ?? 0.01;
    difficulty = depth > 0.004 ? 'easy' : depth > 0.0008 ? 'medium' : 'hard';
  } else if (h.t === 'rv') {
    difficulty = (h.mj ?? 1) > 0.3 ? 'easy' : (h.mj ?? 1) > 0.03 ? 'medium' : 'hard';
  } else difficulty = 'medium';
  const found = METHODS[h.t].short.toLowerCase();
  const note = practice
    ? 'A made-up practice star so you can try this method.'
    : `${h.n} ${h.pl}${h.mj ? `, about ${h.mj >= 0.1 ? h.mj.toFixed(2) + ' Jupiters' : (h.mj * EARTH_PER_MJ).toFixed(1) + ' Earths'} in mass` : ''}${period ? `, orbiting every ${period < 100 ? period.toFixed(2) : Math.round(period)} days` : ''}. Discovered ${h.y} by the ${found} method.`;
  return {
    id,
    name: h.n,
    constellation: '',
    ra: h.ra,
    dec: h.dec,
    magnitude: mag,
    mission: practice ? 'Practice' : 'Catalog',
    method: h.t,
    planet,
    tagline: TAG[h.t](h, planet),
    story: note,
    difficulty,
    star,
    known: { kind: 'planet', periodDays: period ?? 0, depthPpm: standIn?.transits[0] ? Math.round(standIn.transits[0].depth * 1e6) : 0, note },
    standIn,
  };
}

/** Light-years to a short phrase. */
export function distanceWords(ly: number | null | undefined): string {
  if (!ly) return 'distance unknown';
  return ly >= 1000 ? `${Math.round(ly / 100) / 10}k light-years away` : `${Math.round(ly)} light-years away`;
}

/** Hosts with a given method that the labs can use. */
export function labReady(t: SkyTarget): boolean {
  if (t.method === 'transit') return !!t.standIn;
  if (t.method === 'imaging') return !!(t.planet?.sepAU && t.planet.distLy);
  if (t.method === 'astrometry') return !!(t.planet?.periodDays && t.planet.distLy && t.planet.massJup);
  if (t.method === 'microlensing') return !!t.planet?.massJup;
  return !!(t.planet?.periodDays && t.planet.massJup);
}
export { imagingGeometry };
