import { describe, expect, it } from 'vitest';
import { lensMagnification } from './methods';
import { microFromOgle } from './microreal';

describe('microFromOgle', () => {
  const hjd: number[] = [], mag: number[] = [], err: number[] = [];
  for (let d = 0; d < 300; d += 0.7) {
    const A = lensMagnification(d, 150, 25, 0.15) + (Math.abs(d - 135) < 0.8 ? 0.5 : 0);
    hjd.push(2455000 + d);
    mag.push(18 - 2.5 * Math.log10(A) + Math.sin(d * 7) * 0.004);
    err.push(0.01);
  }
  it('recovers the hump and the flash', () => {
    const m = microFromOgle({ hjd, mag, err }, 1, 0.5)!;
    expect(m).not.toBeNull();
    expect(Math.abs(m.tE - 25)).toBeLessThan(6);
    expect(Math.abs(m.tp - 60 - (135 - 150))).toBeLessThan(4);
  });
  it('rejects a flat star', () => {
    const flat = { hjd, mag: hjd.map(() => 18), err };
    expect(microFromOgle(flat, 1, 0.5)).toBeNull();
  });
});
