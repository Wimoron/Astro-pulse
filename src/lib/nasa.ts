import type { HostRec } from './hosts';

/** Parses CSV text, including quoted fields. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

export const TAP_COLUMNS = 'pl_name,hostname,ra,dec,sy_vmag,discoverymethod,pl_orbper,pl_rade,pl_bmasse,pl_orbsmax,sy_dist,st_mass,st_teff,disc_year,disc_facility,tic_id,sy_pnum';
/** Extra column NASA may rename; the catalog still works without it. */
export const TAP_OPTIONAL = 'rowupdate,pl_tranmid,pl_trandur,st_rad';

const METHOD: Record<string, HostRec['t']> = {
  Transit: 'transit',
  'Radial Velocity': 'rv',
  Imaging: 'imaging',
  Microlensing: 'microlensing',
  Astrometry: 'astrometry',
};

const num = (x: string | undefined): number | null => {
  if (x === undefined || x.trim() === '') return null;
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
};

/** One row per star, from the NASA Exoplanet Archive "pscomppars" table (CSV). */
export function catalogFromCsv(text: string): HostRec[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const head = rows[0]!;
  const ix = (n: string) => head.indexOf(n);
  const col = Object.fromEntries(`${TAP_COLUMNS},${TAP_OPTIONAL}`.split(',').map((n) => [n, ix(n)]));
  const best = new Map<string, HostRec>();
  for (const r of rows.slice(1)) {
    const get = (n: string) => (col[n]! >= 0 ? r[col[n]!] : undefined);
    const ra = num(get('ra')), dec = num(get('dec'));
    const host = get('hostname');
    const dm = get('discoverymethod') ?? '';
    if (!host || ra === null || dec === null) continue;
    const per = num(get('pl_orbper'));
    const massE = num(get('pl_bmasse'));
    const distPc = num(get('sy_dist'));
    const name = get('pl_name') ?? host;
    const rec: HostRec = {
      n: host,
      ra: Math.round(ra * 1000) / 1000,
      dec: Math.round(dec * 1000) / 1000,
      m: num(get('sy_vmag')),
      t: METHOD[dm] ?? 'other',
      pl: name.startsWith(host) ? name.slice(host.length).trim() || 'b' : name,
      p: per,
      r: num(get('pl_rade')),
      mj: massE ? Math.round((massE / 317.83) * 1e5) / 1e5 : null,
      a: num(get('pl_orbsmax')),
      d: distPc ? Math.round(distPc * 3.2616 * 10) / 10 : null,
      sm: num(get('st_mass')),
      te: num(get('st_teff')),
      y: num(get('disc_year')) ?? 0,
      tic: (get('tic_id') ?? '').replace(/^TIC\s*/i, '') || null,
      np: num(get('sy_pnum')) ?? 1,
      fac: get('disc_facility') || null,
      rd: get('rowupdate') || null,
      om: dm || null,
      tm: num(get('pl_tranmid')),
      td: num(get('pl_trandur')),
      sr: num(get('st_rad')),
    };
    const old = best.get(host);
    // Keep the planet that is easiest to practise on: the shortest orbit.
    if (!old || (per !== null && (old.p === null || per < old.p))) best.set(host, rec);
  }
  return [...best.values()].sort((a, b) => a.n.localeCompare(b.n));
}

// ---------------- FITS light curves ----------------

interface Hdu {
  cards: Record<string, string>;
  dataStart: number;
  dataBytes: number;
}

function readHeaders(buf: Uint8Array): Hdu[] {
  const out: Hdu[] = [];
  const dec = new TextDecoder('ascii');
  let pos = 0;
  while (pos + 2880 <= buf.length) {
    const cards: Record<string, string> = {};
    let ended = false;
    while (!ended && pos + 2880 <= buf.length) {
      const block = dec.decode(buf.subarray(pos, pos + 2880));
      pos += 2880;
      for (let i = 0; i < 36; i++) {
        const card = block.slice(i * 80, i * 80 + 80);
        const key = card.slice(0, 8).trim();
        if (key === 'END') { ended = true; break; }
        if (card[8] === '=') {
          let v = card.slice(10).trim();
          if (v.startsWith("'")) {
            const e = v.indexOf("'", 1);
            v = v.slice(1, e < 0 ? undefined : e).trim();
          } else v = v.split('/')[0]!.trim();
          cards[key] = v;
        }
      }
    }
    const bitpix = Math.abs(Number(cards.BITPIX ?? 8));
    const naxis = Number(cards.NAXIS ?? 0);
    let size = naxis ? 1 : 0;
    for (let k = 1; k <= naxis; k++) size *= Number(cards[`NAXIS${k}`] ?? 0);
    const dataBytes = (bitpix / 8) * (Number(cards.GCOUNT ?? 1) * (Number(cards.PCOUNT ?? 0) + size));
    out.push({ cards, dataStart: pos, dataBytes });
    pos += Math.ceil(dataBytes / 2880) * 2880;
  }
  return out;
}

const TFORM_BYTES: Record<string, number> = { D: 8, E: 4, J: 4, I: 2, K: 8, B: 1, L: 1, A: 1 };

/** Reads named numeric columns from the first binary table that has them. */
export function readFitsColumns(buf: Uint8Array, names: string[]): Record<string, Float64Array> | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  for (const h of readHeaders(buf)) {
    if (h.cards.XTENSION !== 'BINTABLE') continue;
    const rowBytes = Number(h.cards.NAXIS1);
    const rows = Number(h.cards.NAXIS2);
    const fields = Number(h.cards.TFIELDS);
    const cols: Record<string, { off: number; type: string }> = {};
    let off = 0;
    for (let f = 1; f <= fields; f++) {
      const m = /^(\d*)([A-Z])/.exec(h.cards[`TFORM${f}`] ?? '');
      if (!m) return null;
      const rep = m[1] ? Number(m[1]) : 1;
      cols[(h.cards[`TTYPE${f}`] ?? '').toUpperCase()] = { off, type: m[2]! };
      off += rep * (TFORM_BYTES[m[2]!] ?? 0);
    }
    if (!names.some((n) => cols[n])) continue;
    const out: Record<string, Float64Array> = {};
    for (const n of names) {
      const c = cols[n];
      if (!c) continue;
      const arr = new Float64Array(rows);
      for (let r = 0; r < rows; r++) {
        const p = h.dataStart + r * rowBytes + c.off;
        arr[r] = c.type === 'D' ? view.getFloat64(p) : c.type === 'E' ? view.getFloat32(p) : c.type === 'J' ? view.getInt32(p) : c.type === 'I' ? view.getInt16(p) : c.type === 'K' ? Number(view.getBigInt64(p)) : view.getUint8(p);
      }
      out[n] = arr;
    }
    return out;
  }
  return null;
}

export interface LiveCurve {
  time: number[];
  flux: number[];
}

/** TESS or Kepler light curve file to a clean, normalised curve (about 10 minute bins at most). */
export function curveFromFits(buf: Uint8Array, binMinutes = 10): LiveCurve | null {
  const cols = readFitsColumns(buf, ['TIME', 'PDCSAP_FLUX', 'SAP_FLUX', 'QUALITY']);
  if (!cols || !cols.TIME) return null;
  const flux = cols.PDCSAP_FLUX ?? cols.SAP_FLUX;
  if (!flux) return null;
  const t: number[] = [];
  const f: number[] = [];
  for (let i = 0; i < flux.length; i++) {
    const q = cols.QUALITY ? cols.QUALITY[i]! : 0;
    if (q !== 0 || !Number.isFinite(cols.TIME![i]!) || !Number.isFinite(flux[i]!)) continue;
    t.push(cols.TIME![i]!);
    f.push(flux[i]!);
  }
  if (t.length < 100) return null;
  const med = [...f].sort((a, b) => a - b)[Math.floor(f.length / 2)]!;
  if (!(med > 0)) return null;
  const t0 = t[0]!;
  const bin = Math.max(binMinutes / 1440, 1e-9);
  const time: number[] = [];
  const out: number[] = [];
  let i = 0;
  while (i < t.length) {
    let j = i, st = 0, sf = 0;
    while (j < t.length && (j === i || t[j]! - t[i]! < bin)) { st += t[j]!; sf += f[j]!; j++; }
    const n = j - i;
    time.push(Math.round((st / n - t0) * 1e5) / 1e5);
    out.push(Math.round((sf / n / med) * 1e6) / 1e6);
    i = j;
  }
  return { time, flux: out };
}
