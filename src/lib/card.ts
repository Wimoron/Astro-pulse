export interface CardSpec {
  kicker: string;
  title: string;
  facts: Array<[string, string]>;
  color: string;
  footer: string;
}

/** Draws a 1080x1350 share picture. */
export function drawCard(s: CardSpec): Promise<Blob> {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#050506';
  g.fillRect(0, 0, W, H);
  // faint stars
  let a = 7;
  for (let i = 0; i < 140; i++) {
    a = (a * 16807) % 2147483647;
    const x = (a % W);
    a = (a * 16807) % 2147483647;
    const y = (a % H);
    g.fillStyle = `rgba(255,255,255,${0.1 + ((a % 50) / 50) * 0.5})`;
    g.fillRect(x, y, 2, 2);
  }
  const heading = "'Montserrat Variable', Montserrat, system-ui, sans-serif";
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff';
  g.font = `800 36px ${heading}`;
  g.letterSpacing = '8px';
  g.fillText('ASTRO', 72, 110);
  const w = g.measureText('ASTRO').width;
  g.fillStyle = '#ff7a45';
  g.fillText('PULSE', 72 + w, 110);
  g.letterSpacing = '4px';
  g.fillStyle = s.color;
  g.font = `700 30px ${heading}`;
  g.fillText(s.kicker.toUpperCase(), 72, 420);
  g.letterSpacing = '0px';
  g.fillStyle = '#fff';
  g.font = `800 92px ${heading}`;
  const words = s.title.split(' ');
  let line = '';
  let y = 530;
  for (const wd of words) {
    const t = line ? `${line} ${wd}` : wd;
    if (g.measureText(t).width > W - 144 && line) {
      g.fillText(line, 72, y);
      line = wd;
      y += 104;
    } else line = t;
  }
  g.fillText(line, 72, y);
  y += 90;
  // facts grid
  const cw = (W - 144 - 24) / 2;
  s.facts.slice(0, 4).forEach(([k, v], i) => {
    const x = 72 + (i % 2) * (cw + 24);
    const yy = y + Math.floor(i / 2) * 170;
    g.fillStyle = '#0a0a0d';
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(x, yy, cw, 146, 16);
    g.fill();
    g.stroke();
    g.fillStyle = '#8a8a96';
    g.font = `600 22px ${heading}`;
    g.letterSpacing = '3px';
    g.fillText(k.toUpperCase(), x + 28, yy + 52);
    g.letterSpacing = '0px';
    g.fillStyle = '#fff';
    g.font = `500 40px 'JetBrains Mono Variable', ui-monospace, monospace`;
    g.fillText(v, x + 28, yy + 110);
  });
  g.fillStyle = '#8a8a96';
  g.font = `500 28px ${heading}`;
  g.fillText(s.footer, 72, H - 72);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not make the picture'))), 'image/png'));
}

/** Opens the phone's share sheet with the picture, or downloads it. */
export async function shareCard(s: CardSpec, file: string): Promise<'shared' | 'saved'> {
  try {
    await document.fonts?.load("800 36px 'Montserrat Variable'");
  } catch {
    /* fonts are a nicety */
  }
  const blob = await drawCard(s);
  const f = new File([blob], file, { type: 'image/png' });
  if (navigator.canShare?.({ files: [f] })) {
    try {
      await navigator.share({ files: [f], title: s.title, text: `${s.kicker}: ${s.title}. Found with AstroPulse.` });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'saved';
}
