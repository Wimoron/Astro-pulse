import { describe, expect, it } from 'vitest';
import { catalogFromCsv, curveFromFits, parseCsv, TAP_COLUMNS } from './nasa';

function card(k: string, v: string): string {
  return (k.padEnd(8) + '= ' + v).padEnd(80);
}
function header(cards: string[]): Uint8Array {
  const s = cards.concat('END'.padEnd(80)).join('');
  const out = new Uint8Array(Math.ceil(s.length / 2880) * 2880).fill(32);
  out.set(new TextEncoder().encode(s));
  return out;
}
/** Builds a tiny TESS-like FITS file: empty primary + one binary table (TIME D, PDCSAP_FLUX E, QUALITY J). */
function makeFits(n: number, f: (i: number) => number, q: (i: number) => number): Uint8Array {
  const primary = header([card('SIMPLE', 'T'), card('BITPIX', '8'), card('NAXIS', '0'), card('EXTEND', 'T')]);
  const rowBytes = 8 + 4 + 4;
  const ext = header([
    card('XTENSION', "'BINTABLE'"), card('BITPIX', '8'), card('NAXIS', '2'), card('NAXIS1', String(rowBytes)), card('NAXIS2', String(n)),
    card('PCOUNT', '0'), card('GCOUNT', '1'), card('TFIELDS', '3'),
    card('TTYPE1', "'TIME'"), card('TFORM1', "'1D'"), card('TTYPE2', "'PDCSAP_FLUX'"), card('TFORM2', "'1E'"), card('TTYPE3', "'QUALITY'"), card('TFORM3', "'1J'"),
  ]);
  const data = new Uint8Array(Math.ceil((n * rowBytes) / 2880) * 2880);
  const dv = new DataView(data.buffer);
  for (let i = 0; i < n; i++) {
    dv.setFloat64(i * rowBytes, 1000 + i * (2 / 1440));
    dv.setFloat32(i * rowBytes + 8, f(i));
    dv.setInt32(i * rowBytes + 12, q(i));
  }
  const all = new Uint8Array(primary.length + ext.length + data.length);
  all.set(primary); all.set(ext, primary.length); all.set(data, primary.length + ext.length);
  return all;
}

describe('NASA data readers', () => {
  it('reads quoted CSV fields', () => {
    expect(parseCsv('a,b\n"x,y",2\n')).toEqual([['a', 'b'], ['x,y', '2']]);
  });

  it('turns an archive table into one row per star and classifies the method', () => {
    const head = TAP_COLUMNS;
    const row = (name: string, host: string, method: string, per: string) =>
      [name, host, '10.5', '-20.25', '9.1', method, per, '2.5', '317.83', '0.05', '30', '1.0', '5500', '2020', 'TESS', 'TIC 123', '2', '2020-05-01'].join(',');
    const csv = [head, row('Star b', 'Star', 'Transit', '5'), row('Star c', 'Star', 'Transit', '2'), row('Other b', 'Other', 'Pulsar Timing', '40')].join('\n');
    const hosts = catalogFromCsv(csv);
    expect(hosts).toHaveLength(2);
    const star = hosts.find((h) => h.n === 'Star')!;
    expect(star.pl).toBe('c');
    expect(star.t).toBe('transit');
    expect(star.mj).toBeCloseTo(1, 3);
    expect(star.d).toBeCloseTo(97.8, 0);
    expect(star.tic).toBe('123');
    expect(hosts.find((h) => h.n === 'Other')!.t).toBe('other');
  });

  it('reads a FITS light curve, drops bad rows, normalises and bins', () => {
    const n = 600;
    const fits = makeFits(n, (i) => 5000 + (i % 7), (i) => (i === 10 ? 1 : 0));
    const c = curveFromFits(fits, 10)!;
    expect(c).not.toBeNull();
    expect(c.time[0]).toBeLessThan(0.01);
    expect(c.flux.length).toBeLessThan(n);
    expect(c.flux.every((v) => Math.abs(v - 1) < 0.01)).toBe(true);
    // Without binning every good row stays.
    expect(curveFromFits(fits, 0)!.flux).toHaveLength(n - 1);
  });
});
