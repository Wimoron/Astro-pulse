'use client';

import { useEffect, useRef, useState } from 'react';

export interface Series {
  x: number[];
  y: number[];
  color: string;
  kind?: 'points' | 'line';
  size?: number;
}
export interface VLine {
  x: number;
  color: string;
  label?: string;
  dash?: boolean;
}
interface Props {
  series: Series[];
  vlines?: VLine[];
  height?: number;
  xLabel?: string;
  yLabel?: string;
  xRange?: [number, number];
  yRange?: [number, number];
  ariaLabel: string;
}

const M = { l: 58, r: 12, t: 10, b: 38 };

function niceTicks(min: number, max: number, target = 6): { ticks: number[]; step: number } {
  const span = max - min || 1;
  const raw = span / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * pow;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(v);
  return { ticks, step };
}

function fmt(v: number, step: number): string {
  const dec = Math.max(0, Math.min(8, -Math.floor(Math.log10(step) + 1e-9)));
  return v.toFixed(dec);
}

function autoY(series: Series[]): [number, number] {
  const vals: number[] = [];
  for (const s of series) {
    const stride = Math.max(1, Math.floor(s.y.length / 4000));
    for (let i = 0; i < s.y.length; i += stride) if (Number.isFinite(s.y[i]!)) vals.push(s.y[i]!);
  }
  if (!vals.length) return [0, 1];
  vals.sort((a, b) => a - b);
  const lo = vals[Math.floor(vals.length * 0.003)]!;
  const hi = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.997))]!;
  const pad = (hi - lo || Math.abs(hi) * 0.01 || 1) * 0.08;
  return [lo - pad, hi + pad];
}

export function Plot({ series, vlines = [], height = 240, xLabel, yLabel, xRange, yRange, ariaLabel }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setWidth(Math.max(240, Math.floor(e[0]!.contentRect.width))));
    ro.observe(el);
    setWidth(Math.max(240, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.floor(width * dpr);
    c.height = Math.floor(height * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    let x0 = Infinity;
    let x1 = -Infinity;
    for (const s of series) {
      for (let i = 0; i < s.x.length; i++) {
        const v = s.x[i]!;
        if (v < x0) x0 = v;
        if (v > x1) x1 = v;
      }
    }
    if (xRange) [x0, x1] = xRange;
    if (!Number.isFinite(x0) || x0 === x1) {
      x0 = 0;
      x1 = 1;
    }
    const [y0, y1] = yRange ?? autoY(series);
    const pw = width - M.l - M.r;
    const ph = height - M.t - M.b;
    const sx = (v: number) => M.l + ((v - x0) / (x1 - x0)) * pw;
    const sy = (v: number) => M.t + (1 - (v - y0) / (y1 - y0)) * ph;

    ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = '#b3c0da';
    ctx.strokeStyle = '#1d2a45';
    ctx.lineWidth = 1;

    const xt = niceTicks(x0, x1, Math.max(3, Math.floor(pw / 90)));
    ctx.textAlign = 'center';
    for (const t of xt.ticks) {
      const px = Math.round(sx(t)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, M.t);
      ctx.lineTo(px, M.t + ph);
      ctx.stroke();
      ctx.fillText(fmt(t, xt.step), px, M.t + ph + 15);
    }
    const yt = niceTicks(y0, y1, Math.max(3, Math.floor(ph / 40)));
    ctx.textAlign = 'right';
    for (const t of yt.ticks) {
      const py = Math.round(sy(t)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(M.l, py);
      ctx.lineTo(M.l + pw, py);
      ctx.stroke();
      ctx.fillText(fmt(t, yt.step), M.l - 6, py + 4);
    }
    ctx.strokeStyle = '#3d4d78';
    ctx.strokeRect(M.l + 0.5, M.t + 0.5, pw, ph);

    ctx.save();
    ctx.beginPath();
    ctx.rect(M.l, M.t, pw, ph);
    ctx.clip();
    for (const s of series) {
      ctx.fillStyle = s.color;
      ctx.strokeStyle = s.color;
      if (s.kind === 'line') {
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < s.x.length; i++) {
          const px = sx(s.x[i]!);
          const py = sy(s.y[i]!);
          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else ctx.lineTo(px, py);
        }
        ctx.stroke();
      } else {
        const r = s.size ?? 1.3;
        for (let i = 0; i < s.x.length; i++) {
          const px = sx(s.x[i]!);
          const py = sy(s.y[i]!);
          if (py < M.t - 3 || py > M.t + ph + 3) continue;
          ctx.fillRect(px - r, py - r, r * 2, r * 2);
        }
      }
    }
    for (const v of vlines) {
      const px = Math.round(sx(v.x)) + 0.5;
      ctx.strokeStyle = v.color;
      ctx.lineWidth = 1;
      ctx.setLineDash(v.dash ? [4, 4] : []);
      ctx.beginPath();
      ctx.moveTo(px, M.t);
      ctx.lineTo(px, M.t + ph);
      ctx.stroke();
      ctx.setLineDash([]);
      if (v.label) {
        ctx.fillStyle = v.color;
        ctx.textAlign = 'left';
        ctx.fillText(v.label, px + 3, M.t + 12);
      }
    }
    ctx.restore();

    ctx.fillStyle = '#c5d1ea';
    ctx.textAlign = 'center';
    if (xLabel) ctx.fillText(xLabel, M.l + pw / 2, height - 4);
    if (yLabel) {
      ctx.save();
      ctx.translate(11, M.t + ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(yLabel, 0, 0);
      ctx.restore();
    }
  }, [series, vlines, width, height, xLabel, yLabel, xRange, yRange]);

  return (
    <div ref={wrap} className="w-full">
      <canvas ref={canvas} role="img" aria-label={ariaLabel} style={{ width: '100%', height }} />
    </div>
  );
}
