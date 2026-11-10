/** Sky maths for planning observations. Accurate to about a minute of time and a degree of sky, which is plenty for planning. */

const RAD = Math.PI / 180;
const DAY = 86400000;

export const jdOf = (d: Date): number => d.getTime() / DAY + 2440587.5;
export const dateOfJd = (jd: number): Date => new Date((jd - 2440587.5) * DAY);

/** Local sidereal time in degrees for a longitude (east positive). */
export function lstDeg(jd: number, lonDeg: number): number {
  const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545);
  return (((gmst + lonDeg) % 360) + 360) % 360;
}

/** Height above the horizon in degrees for a star at ra/dec (degrees). */
export function altitude(raDeg: number, decDeg: number, latDeg: number, lonDeg: number, jd: number): number {
  const ha = (lstDeg(jd, lonDeg) - raDeg) * RAD;
  const d = decDeg * RAD;
  const la = latDeg * RAD;
  return Math.asin(Math.sin(d) * Math.sin(la) + Math.cos(d) * Math.cos(la) * Math.cos(ha)) / RAD;
}

/** Compass direction (0 = north, 90 = east) of a star. */
export function azimuth(raDeg: number, decDeg: number, latDeg: number, lonDeg: number, jd: number): number {
  const ha = (lstDeg(jd, lonDeg) - raDeg) * RAD;
  const d = decDeg * RAD;
  const la = latDeg * RAD;
  const y = -Math.sin(ha) * Math.cos(d);
  const x = Math.sin(d) * Math.cos(la) - Math.cos(d) * Math.sin(la) * Math.cos(ha);
  return (((Math.atan2(y, x) / RAD) % 360) + 360) % 360;
}

export function compass(az: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8]!;
}

/** The Sun's position (degrees) and height above the horizon. */
export function sunAltitude(latDeg: number, lonDeg: number, jd: number): number {
  const n = jd - 2451545;
  const L = 280.46 + 0.9856474 * n;
  const g = (357.528 + 0.9856003 * n) * RAD;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 4e-7 * n) * RAD;
  const ra = (Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) / RAD + 360) % 360;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam)) / RAD;
  return altitude(ra, dec, latDeg, lonDeg, jd);
}

/** How much of the Moon is lit, 0 to 1 (good to a few percent). */
export function moonLit(jd: number): number {
  const age = (((jd - 2451550.1) % 29.530588) + 29.530588) % 29.530588;
  return (1 - Math.cos((2 * Math.PI * age) / 29.530588)) / 2;
}

export interface Night {
  /** When it is dark enough to observe (Sun at least 12 degrees below the horizon). */
  start: Date;
  end: Date;
  sunset: Date | null;
  sunrise: Date | null;
}

/** The next dark period that has not ended yet, starting the search at `from`. */
export function nextNight(latDeg: number, lonDeg: number, from: Date, dark = -12): Night | null {
  const step = 5 * 60000;
  const t0 = from.getTime();
  let start: number | null = null;
  let end: number | null = null;
  for (let t = t0; t < t0 + 48 * 3600000; t += step) {
    const dk = sunAltitude(latDeg, lonDeg, jdOf(new Date(t))) < dark;
    if (dk && start === null) start = t;
    if (!dk && start !== null) {
      end = t;
      break;
    }
  }
  if (start === null) return null;
  if (end === null) end = t0 + 48 * 3600000;
  let sunset: number | null = null;
  let sunrise: number | null = null;
  for (let t = start; t > start - 12 * 3600000; t -= step) if (sunAltitude(latDeg, lonDeg, jdOf(new Date(t))) > -0.83) { sunset = t; break; }
  for (let t = end; t < end + 12 * 3600000; t += step) if (sunAltitude(latDeg, lonDeg, jdOf(new Date(t))) > -0.83) { sunrise = t; break; }
  return { start: new Date(start), end: new Date(end), sunset: sunset ? new Date(sunset) : null, sunrise: sunrise ? new Date(sunrise) : null };
}

export interface Pass {
  /** Highest point during the night, in degrees. */
  maxAlt: number;
  bestTime: Date;
  /** Fraction of the night (0 to 1) spent above `minAlt`. */
  upFrac: number;
  /** Alt every 30 minutes, for a small chart. */
  track: number[];
}

/** How a star moves across the sky during a night. */
export function passDuring(raDeg: number, decDeg: number, latDeg: number, lonDeg: number, night: Night, minAlt = 30): Pass {
  const span = night.end.getTime() - night.start.getTime();
  const n = Math.max(2, Math.round(span / (10 * 60000)));
  let maxAlt = -90;
  let best = night.start.getTime();
  let up = 0;
  const track: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = night.start.getTime() + (span * i) / n;
    const a = altitude(raDeg, decDeg, latDeg, lonDeg, jdOf(new Date(t)));
    if (a > maxAlt) {
      maxAlt = a;
      best = t;
    }
    if (a >= minAlt) up++;
    if (i % 3 === 0) track.push(Math.round(a));
  }
  return { maxAlt, bestTime: new Date(best), upFrac: up / (n + 1), track };
}

export interface TransitEvent {
  start: Date;
  mid: Date;
  end: Date;
  epoch: number;
}

/** The next transits after `from`. `tmBjd` is a known mid-transit time, `periodDays` the orbit, `hours` the length. */
export function nextTransits(tmBjd: number, periodDays: number, hours: number, from: Date, count: number): TransitEvent[] {
  if (!(periodDays > 0.05)) return [];
  const jd0 = jdOf(from);
  let k = Math.ceil((jd0 - tmBjd - (hours / 48)) / periodDays);
  const out: TransitEvent[] = [];
  for (let i = 0; i < count; i++, k++) {
    const mid = tmBjd + k * periodDays;
    out.push({ start: dateOfJd(mid - hours / 48), mid: dateOfJd(mid), end: dateOfJd(mid + hours / 48), epoch: k });
  }
  return out;
}

/** Is the whole event (start, middle, end) at least `minAlt` high while the Sun is below `sunMax`? */
export function observability(raDeg: number, decDeg: number, latDeg: number, lonDeg: number, ev: TransitEvent, minAlt = 25, sunMax = -6): { ok: boolean; partial: boolean; midAlt: number } {
  const pts = [ev.start, ev.mid, ev.end].map((d) => {
    const jd = jdOf(d);
    return { alt: altitude(raDeg, decDeg, latDeg, lonDeg, jd), sun: sunAltitude(latDeg, lonDeg, jd) };
  });
  const good = pts.map((p) => p.alt >= minAlt && p.sun <= sunMax);
  return { ok: good.every(Boolean), partial: good.some(Boolean), midAlt: pts[1]!.alt };
}

/** Needs the sky to be dark enough and the telescope big enough. */
export const GEAR = [
  { id: 'eye', label: 'Just my eyes', limit: 5.5, hint: 'Brightest stars only' },
  { id: 'bino', label: 'Binoculars', limit: 9, hint: 'About 50 mm' },
  { id: 'small', label: 'Small telescope', limit: 12, hint: '80–130 mm' },
  { id: 'club', label: 'Club telescope', limit: 14, hint: '200 mm or more' },
] as const;
export type GearId = (typeof GEAR)[number]['id'];

export const PLACES: Array<{ name: string; lat: number; lon: number }> = [
  { name: 'Pune, India', lat: 18.52, lon: 73.86 },
  { name: 'Mumbai, India', lat: 19.08, lon: 72.88 },
  { name: 'Delhi, India', lat: 28.61, lon: 77.21 },
  { name: 'Bengaluru, India', lat: 12.97, lon: 77.59 },
  { name: 'Kolkata, India', lat: 22.57, lon: 88.36 },
  { name: 'Chennai, India', lat: 13.08, lon: 80.27 },
  { name: 'Hanle, India (dark sky)', lat: 32.78, lon: 78.96 },
  { name: 'London, UK', lat: 51.51, lon: -0.13 },
  { name: 'New York, USA', lat: 40.71, lon: -74.01 },
  { name: 'Los Angeles, USA', lat: 34.05, lon: -118.24 },
  { name: 'Sydney, Australia', lat: -33.87, lon: 151.21 },
  { name: 'Cape Town, South Africa', lat: -33.92, lon: 18.42 },
  { name: 'Santiago, Chile', lat: -33.45, lon: -70.67 },
  { name: 'Tokyo, Japan', lat: 35.68, lon: 139.69 },
  { name: 'Dubai, UAE', lat: 25.2, lon: 55.27 },
];

/** A calendar file (.ics) with one reminder per event. */
export function icsFor(events: Array<{ title: string; start: Date; end: Date; note: string }>): string {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/[\;,]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AstroPulse//Transit predictor//EN', 'CALSCALE:GREGORIAN'];
  events.forEach((e, i) => {
    lines.push('BEGIN:VEVENT', `UID:astropulse-${f(e.start)}-${i}@astropulse`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(e.start)}`, `DTEND:${f(e.end)}`, `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(e.note)}`, 'BEGIN:VALARM', 'TRIGGER:-PT60M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)} starts in an hour`, 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
