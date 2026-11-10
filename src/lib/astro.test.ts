import { describe, expect, it } from 'vitest';
import { altitude, icsFor, jdOf, moonLit, nextNight, nextTransits, observability, passDuring, sunAltitude } from './astro';

describe('sky maths', () => {
  it('J2000 julian date', () => {
    expect(jdOf(new Date('2000-01-01T12:00:00Z'))).toBeCloseTo(2451545, 4);
  });
  it('Polaris stays near the latitude in height', () => {
    const a = altitude(37.95, 89.26, 18.52, 73.86, jdOf(new Date('2026-11-09T20:00:00Z')));
    expect(a).toBeGreaterThan(17);
    expect(a).toBeLessThan(20.5);
  });
  it('Sun is high at local noon in Pune and low at midnight', () => {
    expect(sunAltitude(18.52, 73.86, jdOf(new Date('2026-11-09T06:45:00Z')))).toBeGreaterThan(50);
    expect(sunAltitude(18.52, 73.86, jdOf(new Date('2026-11-08T20:00:00Z')))).toBeLessThan(-40);
  });
  it('finds tonight dark period (about 7 pm to 5 am in Pune in November)', () => {
    const n = nextNight(18.52, 73.86, new Date('2026-11-09T05:00:00Z'))!;
    const hrs = (n.end.getTime() - n.start.getTime()) / 3600000;
    expect(hrs).toBeGreaterThan(9);
    expect(hrs).toBeLessThan(11.5);
    expect(n.sunset!.getTime()).toBeLessThan(n.start.getTime());
  });
  it('a star on the meridian peaks during a night', () => {
    const n = nextNight(18.52, 73.86, new Date('2026-11-09T05:00:00Z'))!;
    const p = passDuring(0, 18.5, 18.52, 73.86, n);
    expect(p.maxAlt).toBeGreaterThan(80);
    expect(p.track.length).toBeGreaterThan(10);
  });
  it('moon lit fraction is between 0 and 1; full moon on 2000-01-21', () => {
    expect(moonLit(jdOf(new Date('2000-01-21T04:40:00Z')))).toBeGreaterThan(0.95);
    expect(moonLit(jdOf(new Date('2000-01-06T18:14:00Z')))).toBeLessThan(0.05);
  });
  it('predicts transits at the right spacing', () => {
    const ev = nextTransits(2452826.628521, 3.52474859, 3, new Date('2026-11-09T00:00:00Z'), 3);
    expect(ev).toHaveLength(3);
    expect((ev[1]!.mid.getTime() - ev[0]!.mid.getTime()) / 86400000).toBeCloseTo(3.52474859, 4);
    expect((ev[0]!.end.getTime() - ev[0]!.start.getTime()) / 3600000).toBeCloseTo(3, 3);
    expect(ev[0]!.end.getTime()).toBeGreaterThan(new Date('2026-11-09T00:00:00Z').getTime());
  });
  it('observability needs a dark sky and a high star', () => {
    const ev = nextTransits(2452826.628521, 3.52474859, 3, new Date('2026-11-09T00:00:00Z'), 1)[0]!;
    const o = observability(330.8, 18.9, 18.52, 73.86, ev);
    expect(typeof o.ok).toBe('boolean');
    const noon = { start: new Date('2026-11-09T05:00:00Z'), mid: new Date('2026-11-09T06:30:00Z'), end: new Date('2026-11-09T08:00:00Z'), epoch: 0 };
    expect(observability(330.8, 18.9, 18.52, 73.86, noon).ok).toBe(false);
  });
  it('writes a valid calendar file', () => {
    const s = icsFor([{ title: 'HD 209458 b, transit', start: new Date('2026-11-10T20:00:00Z'), end: new Date('2026-11-10T23:00:00Z'), note: 'x' }]);
    expect(s).toContain('BEGIN:VEVENT');
    expect(s).toContain('DTSTART:20261110T200000Z');
    expect(s).toContain('HD 209458 b\\, transit');
  });
});
