import type { LightCurve } from './types';
import { median } from './stats';

/** Reads "time,flux" text (comma, tab, space or semicolon separated; header and # comments allowed). */
export function parseLightCurveCsv(text: string): LightCurve {
  const time: number[] = [];
  const flux: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/[,\t; ]+/);
    if (parts.length < 2) continue;
    const t = Number(parts[0]);
    const f = Number(parts[1]);
    if (Number.isFinite(t) && Number.isFinite(f)) {
      time.push(t);
      flux.push(f);
    }
  }
  if (time.length < 200) throw new Error('Found fewer than 200 numeric rows. Expected two columns: time (days) and flux.');
  const idx = time.map((_, i) => i).sort((a, b) => time[a]! - time[b]!);
  const t = idx.map((i) => time[i]!);
  const f0 = idx.map((i) => flux[i]!);
  const m = median(f0);
  if (!(m > 0)) throw new Error('Flux values must be positive.');
  return { time: t, flux: f0.map((v) => v / m) };
}
