import type { PlanetInfo } from './catalog';
import { METHODS, type Method } from './methods';
import type { HuntLog } from './hunt';
import { streak, dayIndex } from './hunt';
import { verdictOf, type Finding } from './candidates';

/** A planet you worked out in a lab. */
export interface Discovery {
  id: string;
  name: string;
  method: Method;
  at: number;
  facts: Array<[string, string]>;
}

const KEY = 'ap-collection-v1';

export function loadCollection(): Discovery[] {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Discovery[];
    return Array.isArray(j) ? j.filter((d) => d && typeof d.id === 'string' && d.method in METHODS) : [];
  } catch {
    return [];
  }
}

/** Adds the discovery once. Returns true if it is new. */
export function recordDiscovery(d: Omit<Discovery, 'at'>): boolean {
  const all = loadCollection();
  if (all.some((x) => x.id === d.id)) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify([{ ...d, at: Date.now() }, ...all].slice(0, 500)));
  } catch {
    /* storage can be full or blocked */
  }
  return true;
}

/** Known facts about the planet in a lab, from the NASA archive. */
export function planetFacts(pl: PlanetInfo): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (pl.periodDays) out.push(['Year', `${pl.periodDays < 100 ? pl.periodDays.toFixed(2) : Math.round(pl.periodDays)} d`]);
  if (pl.massJup) out.push(['Mass', pl.massJup >= 0.1 ? `${pl.massJup.toFixed(1)} Jupiters` : `${(pl.massJup * 317.8).toFixed(1)} Earths`]);
  else if (pl.radiusEarth) out.push(['Size', `${pl.radiusEarth.toFixed(1)} R⊕`]);
  if (pl.sepAU) out.push(['Orbit', `${pl.sepAU < 10 ? pl.sepAU.toFixed(2) : Math.round(pl.sepAU)} AU`]);
  if (pl.distLy) out.push(['Distance', `${Math.round(pl.distLy)} ly`]);
  return out.slice(0, 4);
}

export const RANKS: Array<[number, string]> = [[0, 'Cadet'], [60, 'Observer'], [200, 'Planet hunter'], [500, 'Lead astronomer'], [1200, 'Legend']];

export interface Standing {
  xp: number;
  rank: string;
  next: string | null;
  /** 0 to 1 towards the next rank. */
  pct: number;
  toNext: number;
}

/** Experience: 25 per planet found in a lab, your score in each daily hunt, 10 per candidate call. */
export function xpOf(col: Discovery[], hunt: HuntLog, findings: Finding[]): number {
  const h = Object.values(hunt.days).reduce((s, d) => s + d.pts, 0);
  return col.length * 25 + h + Math.min(hunt.practice, 50) * 5 + findings.length * 10;
}

export function standing(xp: number): Standing {
  let i = 0;
  for (let k = 0; k < RANKS.length; k++) if (xp >= RANKS[k]![0]) i = k;
  const cur = RANKS[i]!;
  const nxt = RANKS[i + 1];
  return { xp, rank: cur[1], next: nxt ? nxt[1] : null, pct: nxt ? (xp - cur[0]) / (nxt[0] - cur[0]) : 1, toNext: nxt ? nxt[0] - xp : 0 };
}

export interface Badge {
  id: string;
  label: string;
  how: string;
  got: boolean;
}

export function badges(col: Discovery[], hunt: HuntLog, findings: Finding[]): Badge[] {
  const days = Object.values(hunt.days);
  const has = (m: Method) => col.some((d) => d.method === m);
  const best = Math.max(0, ...days.map((d) => d.pts));
  const long = Math.max(streak(hunt, dayIndex()), 0);
  return [
    { id: 'transit', label: 'Transit finder', how: 'Finish a transit lab', got: has('transit') },
    { id: 'rv', label: 'Wobble watcher', how: 'Finish a wobble lab', got: has('rv') },
    { id: 'imaging', label: 'Photographer', how: 'Finish a photo lab', got: has('imaging') },
    { id: 'microlensing', label: 'Flash spotter', how: 'Finish a flash lab', got: has('microlensing') },
    { id: 'astrometry', label: 'Star tracker', how: 'Finish a position lab', got: has('astrometry') },
    { id: 'first-hunt', label: 'First hunt', how: 'Play a daily hunt', got: days.length > 0 },
    { id: 'sharp', label: 'Sharp eye', how: 'Score 90 or more in a hunt', got: best >= 90 },
    { id: 'streak3', label: 'On a roll', how: '3 days in a row', got: long >= 3 },
    { id: 'streak7', label: 'Regular', how: '7 days in a row', got: long >= 7 },
    { id: 'five', label: 'Candidate crew', how: 'Call 5 real candidates', got: findings.length >= 5 },
    { id: 'nasa', label: 'NASA agreed', how: 'A call NASA later confirmed', got: findings.some((f) => verdictOf(f) === 'right') },
    { id: 'ten', label: 'Collector', how: 'Find 10 planets in labs', got: col.length >= 10 },
  ];
}
