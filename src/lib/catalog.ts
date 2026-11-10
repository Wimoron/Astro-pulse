import { simulateCurve, type SimSpec } from './simulate';
import type { LightCurve, StarInfo, Target } from './types';
import type { Method } from './methods';

export interface PlanetInfo {
  label: string;
  periodDays: number | null;
  radiusEarth: number | null;
  massJup: number | null;
  sepAU: number | null;
  distLy: number | null;
  starMass: number;
  year: number;
  tic?: string | null;
  nPlanets?: number;
  facility?: string | null;
  released?: string | null;
}

export interface SkyTarget {
  id: string;
  name: string;
  constellation: string;
  /** Degrees. */
  ra: number;
  dec: number;
  magnitude: number;
  mission: 'TESS' | 'Kepler' | 'Practice' | 'Catalog';
  method: Method;
  /** Facts about the known planet (used by the non-transit labs). */
  planet?: PlanetInfo;
  tagline: string;
  story: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'trap';
  star: StarInfo;
  /** What astronomers already know. Hidden until the student asks. */
  known: { kind: 'planet' | 'eclipsing-binary'; periodDays: number; depthPpm: number; note: string };
  /** Used only when the real NASA file is not present. Modeled on the real planet. */
  standIn: SimSpec | null;
  /** Looked up by the student, not in the built-in list. */
  custom?: boolean;
}

const GAP: [number, number] = [13.6, 14.4];

export const SKY_TARGETS: SkyTarget[] = [
  {
    id: 'hd209458',
    name: 'HD 209458',
    constellation: 'Pegasus',
    ra: 330.795,
    dec: 18.884,
    magnitude: 7.65,
    mission: 'TESS',
    method: 'transit',
    tagline: 'The first planet ever caught crossing a star',
    story:
      'In 1999 astronomers saw this star dim by 1.5% every 3.5 days. It was the first time anyone watched a planet pass in front of its star. The planet is a gas giant about 1.4 times the width of Jupiter.',
    difficulty: 'easy',
    star: { radiusSun: 1.16, massSun: 1.12, teffK: 6065 },
    known: {
      kind: 'planet',
      periodDays: 3.5247,
      depthPpm: 14500,
      note: 'HD 209458 b, nicknamed Osiris: a hot gas giant orbiting every 3.52 days.',
    },
    standIn: { seed: 101, days: 27.4, cadenceMin: 10, noise: 0.0004, rotationDays: 11, variability: 0.0007, flares: 0, gap: GAP, transits: [{ period: 3.5247, t0: 1.9, depth: 0.0145, duration: 0.128 }] },
  },
  {
    id: 'wasp18',
    name: 'WASP-18',
    constellation: 'Phoenix',
    ra: 24.354,
    dec: -45.678,
    magnitude: 9.3,
    mission: 'TESS',
    method: 'transit',
    tagline: 'A giant planet that circles its star in 23 hours',
    story:
      'WASP-18 b is about ten times as heavy as Jupiter and so close to its star that a year there lasts less than a day. The dips come very fast, so the search must look at short orbits too.',
    difficulty: 'easy',
    star: { radiusSun: 1.22, massSun: 1.24, teffK: 6400 },
    known: { kind: 'planet', periodDays: 0.9415, depthPpm: 9700, note: 'WASP-18 b: a massive hot Jupiter orbiting every 0.94 days.' },
    standIn: { seed: 202, days: 27.4, cadenceMin: 10, noise: 0.0005, rotationDays: 4.2, variability: 0.0008, flares: 0, gap: GAP, transits: [{ period: 0.9415, t0: 0.4, depth: 0.0097, duration: 0.09 }] },
  },
  {
    id: 'pimen',
    name: 'Pi Mensae',
    constellation: 'Mensa',
    ra: 84.291,
    dec: -80.469,
    magnitude: 5.65,
    mission: 'TESS',
    method: 'transit',
    tagline: 'A bright, Sun-like star with a hidden super-Earth',
    story:
      'This star is visible to the naked eye from the far south. Its inner planet is only about twice Earth’s width, so the dip is tiny, about 0.03%. Cleaning the data well makes the difference.',
    difficulty: 'medium',
    star: { radiusSun: 1.1, massSun: 1.1, teffK: 6037 },
    known: { kind: 'planet', periodDays: 6.2679, depthPpm: 290, note: 'Pi Mensae c: a super-Earth about 2 times Earth’s width, orbiting every 6.27 days.' },
    standIn: { seed: 303, days: 27.4, cadenceMin: 10, noise: 0.00025, rotationDays: 16, variability: 0.0005, flares: 0, gap: GAP, transits: [{ period: 6.2679, t0: 3.1, depth: 0.00029, duration: 0.125 }] },
  },
  {
    id: 'kepler10',
    name: 'Kepler-10',
    constellation: 'Draco',
    ra: 285.679,
    dec: 50.241,
    magnitude: 10.96,
    mission: 'Kepler',
    method: 'transit',
    tagline: 'The first confirmed rocky planet beyond our solar system',
    story:
      'Kepler-10 b is a hot rock about 1.5 times Earth’s width that circles its star in under a day. It blocks only 0.015% of the starlight. This was a landmark find, and it is hard.',
    difficulty: 'hard',
    star: { radiusSun: 1.065, massSun: 0.91, teffK: 5708 },
    known: { kind: 'planet', periodDays: 0.8375, depthPpm: 150, note: 'Kepler-10 b: a molten rocky world orbiting every 0.84 days.' },
    standIn: { seed: 404, days: 40, cadenceMin: 10, noise: 0.00018, rotationDays: 20, variability: 0.0003, flares: 0, gap: null, transits: [{ period: 0.8375, t0: 0.3, depth: 0.00015, duration: 0.075 }] },
  },
  {
    id: 'kepler186',
    name: 'Kepler-186',
    constellation: 'Cygnus',
    ra: 298.653,
    dec: 43.955,
    magnitude: 14.6,
    mission: 'Kepler',
    method: 'transit',
    tagline: 'A faint red star with an Earth-sized world',
    story:
      'Kepler-186 is a cool red dwarf with five known planets. The innermost, Kepler-186 b, is about Earth’s size. The star is faint and spotty, so the data is noisy and the dips are shallow.',
    difficulty: 'hard',
    star: { radiusSun: 0.52, massSun: 0.54, teffK: 3788 },
    known: { kind: 'planet', periodDays: 3.8867, depthPpm: 360, note: 'Kepler-186 b: an Earth-sized planet orbiting every 3.89 days.' },
    standIn: { seed: 505, days: 40, cadenceMin: 10, noise: 0.0005, rotationDays: 34, variability: 0.003, flares: 6, gap: null, transits: [{ period: 3.8867, t0: 2.2, depth: 0.00036, duration: 0.077 }] },
  },
  {
    id: 'practice-eb',
    name: 'Practice star X',
    constellation: 'Monoceros',
    ra: 101.0,
    dec: -6.0,
    magnitude: 11.2,
    mission: 'Practice',
    method: 'transit',
    tagline: 'A deep dip. Planet, or impostor?',
    story:
      'This is a practice star. The data is simulated to look like two stars eclipsing each other. Run every check before you decide, because not every dip is a planet.',
    difficulty: 'trap',
    star: { radiusSun: 1.0, massSun: 1.0, teffK: 5750 },
    known: {
      kind: 'eclipsing-binary',
      periodDays: 2.37,
      depthPpm: 80000,
      note: 'Two stars orbiting each other. Deep dips, a second dip half an orbit later, and odd and even dips that differ.',
    },
    standIn: SIM_EB(),
  },
];

function SIM_EB(): SimSpec {
  return { seed: 41, days: 27.4, cadenceMin: 10, noise: 0.0007, rotationDays: 7.4, variability: 0.003, flares: 2, gap: GAP, transits: [{ period: 2.37, t0: 0.9, depth: 0.08, duration: 0.16, secondary: 0.03, oddEvenRatio: 0.9 }] };
}

export function standInCurve(t: SkyTarget): LightCurve {
  return t.standIn ? simulateCurve(t.standIn) : { time: [], flux: [] };
}

export function difficultyLabel(d: SkyTarget['difficulty']): string {
  return d === 'easy' ? 'Easy' : d === 'medium' ? 'Medium' : d === 'hard' ? 'Hard' : 'Tricky';
}

export function toTarget(t: SkyTarget, curve: LightCurve, real: boolean): Target {
  return {
    id: t.id,
    name: t.name,
    kind: real ? 'real' : 'simulated',
    source: real ? `Real NASA ${t.mission} data` : t.mission === 'Practice' ? 'Practice data (simulated)' : `Stand-in curve modeled on the real planet`,
    blurb: t.tagline,
    difficulty: t.difficulty,
    star: t.star,
    curve,
    truth: t.custom ? undefined : { kind: t.known.kind, periodDays: t.known.periodDays, depthPpm: t.known.depthPpm, note: t.known.note },
  };
}

export function isValidCurve(j: unknown): j is LightCurve {
  const c = j as LightCurve;
  return !!c && Array.isArray(c.time) && Array.isArray(c.flux) && c.time.length > 200 && c.time.length === c.flux.length;
}
