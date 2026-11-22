// Builds the eight mods of ascii-planet-backdrops into plugins/:
//   ascii-sun, ascii-moon, ascii-mars, ascii-mercury, ascii-jupiter, ascii-earth, ascii-saturn: one body, every day;
//   ascii-week: the Sun on Sunday, the Moon on Monday, Mars, Mercury, Jupiter, Earth, Saturn on Saturday.
// Each mod folder is complete on its own (a mod can't import files from outside its folder), so the shared sources in src/
// are copied into each, and the per-body parts are generated:
//   hooks/<body>.shader.ts  src/body.shader.ts with the body's `// #if` blocks kept and its @generated block filled;
//   hooks/scene.ts          the Svg under the shader: the body's map in index colours (the shader reads it back), and the
//                           still ASCII body shown where the shader does not play;
//   hooks/register.tsx      src/register.tsx (src/week.tsx for the week) with the body's settings filled in.
// The Sun and Saturn are drawn from numbers alone; the others read public-domain maps from the data folder (see the README).
// Usage: node tools/build.mjs [data folder]   (default: data/ beside package.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..');
const DATA = process.argv[2] ?? path.join(ROOT, 'data');
const SRC = path.join(ROOT, 'src'), OUT = path.join(ROOT, 'plugins');
const { makeColors } = await import(pathToFileURL(path.join(SRC, 'make-colors.js')).href);
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

let failed = false;
const assert = (ok, what) => { if (!ok) { console.error('FAIL', what); failed = true; } else console.log('ok  ', what); };
const rad = Math.PI / 180;
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
const hex2 = c => '#' + c.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
const hex1 = c => '#' + c.map(v => Math.round(Math.min(1, Math.max(0, v)) * 15).toString(16)).join('');   // #rgb, 16 steps
const lum = c => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

// ---------------------------------------------------------------- the bodies
// flags pick the template's `// #if` blocks; consts fill its @generated block (numbers, or colours as '#rrggbb')
const FIXED_SUN = (() => { const v = [-0.55, 0.35, 0.76], l = Math.hypot(...v); return v.map(x => x / l); })();
const BODIES = {
  sun: {
    label: 'the Sun', day: 0, sun: 'fixed',
    alt: 'The Sun drawn in ASCII characters, its surface churning slowly, with a faint corona',
    flags: ['SUN', 'NOISE', 'SPIN', 'VIEWSUN'],
    consts: { TURN: 600, TILT: 0.12, LON0: 0, BODY_SCALE: 0.78, SUN_CORE: '#fff2c4', SUN_LIMB: '#ff6a12' },
    space: '#090504', accent: '#e0902f',
  },
  moon: {
    label: 'the Moon', day: 1, sun: 'moon', map: { file: 'lroc_color_2k.jpg' },
    alt: 'The Moon drawn in ASCII characters, in today\'s phase, rocking gently',
    flags: ['MAP', 'ROCK', 'PLAIN', 'LIBRATE', 'VIEWSUN', 'RIM'],
    consts: { TILT: 0.05, LON0: 0, BODY_SCALE: 1, NIGHT_GLOW: 0.07, BRIGHTEN: 1.1, RIM_OUT: 1.06, RIM: '#5c6578' },
    space: '#050608', accent: '#9aa6b8',
  },
  mars: {
    label: 'Mars', day: 2, sun: 'fixed', map: { file: 'mars_viking_clrmosaic_global_1024.jpg' },
    alt: 'Mars drawn in ASCII characters, slowly turning, with white polar caps',
    flags: ['MAP', 'ROCK', 'PLAIN', 'SPIN', 'VIEWSUN', 'RIM'],
    consts: { TURN: 240, TILT: 0.3, LON0: -60, BODY_SCALE: 1, NIGHT_GLOW: 0.03, BRIGHTEN: 1.25, RIM_OUT: 1.08, RIM: '#b0705a' },
    space: '#090505', accent: '#d0623a',
  },
  mercury: {
    label: 'Mercury', day: 3, sun: 'fixed', map: { file: 'PIA17386.jpg', shiftHalf: true, desaturate: 0.85, tint: [1.08, 1.0, 0.9] },
    alt: 'Mercury drawn in ASCII characters, grey and cratered, slowly turning',
    flags: ['MAP', 'ROCK', 'PLAIN', 'SPIN', 'VIEWSUN'],
    consts: { TURN: 300, TILT: 0.1, LON0: 0, BODY_SCALE: 1, NIGHT_GLOW: 0.02, BRIGHTEN: 1.35 },
    space: '#070607', accent: '#b39a7a',
  },
  jupiter: {
    label: 'Jupiter', day: 4, sun: 'fixed', map: { file: 'PIA07782.jpg' },
    alt: 'Jupiter drawn in ASCII characters, its cloud bands drifting, with the Great Red Spot',
    flags: ['MAP', 'ROCK', 'JUPITER', 'SPIN', 'VIEWSUN', 'RIM'],
    consts: { TURN: 150, TILT: 0.05, LON0: 65, BODY_SCALE: 1, NIGHT_GLOW: 0.03, BRIGHTEN: 1.1, DRIFT: 0.004, RIM_OUT: 1.05, RIM: '#8a7a64' },
    space: '#080706', accent: '#d0a070',
  },
  earth: {
    label: 'Earth', day: 5, sun: 'earth', map: { earth: true },
    alt: 'Earth drawn in ASCII characters, slowly turning, with the night side lit by cities',
    flags: ['MAP', 'EARTH', 'SPIN', 'BODYSUN', 'RIM'],
    consts: {
      TURN: 240, TILT: 0.3, LON0: -30, BODY_SCALE: 1, RIM_OUT: 1.13, RIM: '#4f8fe0',
      SEA_DAY: '#29548f', SEA_NIGHT: '#121a33', GLINT: '#d9edff', CITY_DIM: '#ff8c29', CITY_BRIGHT: '#ffdb8c', URBAN: '#94856b',
    },
    space: '#05070d', accent: '#4f8fe0',
  },
  saturn: {
    label: 'Saturn', day: 6, sun: 'fixed',
    alt: 'Saturn drawn in ASCII characters, its rings tilted toward the viewer, slowly turning',
    flags: ['SATURN', 'SPIN', 'VIEWSUN'],
    consts: { TURN: 200, TILT: 0.42, LON0: 0, BODY_SCALE: 0.44, RING_COLOR: '#d9c79e' },
    bands: ['#8a7d6a', '#9c8c70', '#b39f7c', '#c9b68e', '#d8c49a', '#cdb487', '#e2d0a6', '#e9d9b0', '#e6d4a8', '#d9c294', '#e0cd9f', '#c8b083', '#d6c193', '#bfa77c', '#a8936f', '#8f8068'],
    space: '#080706', accent: '#d8c28a',
  },
};
const WEEK = Object.keys(BODIES).sort((a, b) => BODIES[a].day - BODIES[b].day);
const STAR = '#8a93a6';

// ---------------------------------------------------------------- the glyphs: a 5 x 7 font, the ramp chosen by measured ink
const FONT = {
  '.': ['.....', '.....', '.....', '.....', '.....', '..#..', '.....'],
  ',': ['.....', '.....', '.....', '.....', '.....', '..#..', '.#...'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  ';': ['.....', '.....', '..#..', '.....', '..#..', '..#..', '.#...'],
  '~': ['.....', '.....', '.#...', '#.#.#', '...#.', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '*': ['.....', '..#..', '#.#.#', '.###.', '#.#.#', '..#..', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '&': ['.##..', '#..#.', '.##..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '$': ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '#': ['.#.#.', '#####', '.#.#.', '.#.#.', '.#.#.', '#####', '.#.#.'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.####'],
};
const ramp = [];
for (const g of Object.entries(FONT).map(([c, rows]) => {
  let lo = 0, hi = 0, ink = 0;
  rows.forEach((row, r) => [...row].forEach((p, col) => {
    if (p !== '#') return;
    ink++; const bit = r * 5 + col;
    if (bit < 32) lo |= 1 << bit; else hi |= 1 << (bit - 32);
  }));
  return { c, lo, hi, ink };
}).sort((a, b) => a.ink - b.ink)) if (!ramp.length || g.ink > ramp[ramp.length - 1].ink) ramp.push(g);
while (ramp.length > 14) ramp.splice(Math.floor(ramp.length / 2), 1);   // the cell buffer keeps a glyph as a / 15
console.log('ramp:', ramp.map(g => g.c).join(''));
const starOf = c => Math.max(1, 1 + ramp.findIndex(g => g.c === c));
const LEVELS = ramp.length;

// ---------------------------------------------------------------- maps
async function raw(file, crop) {
  let img = sharp(file);
  if (crop) img = img.extract(crop);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height, C: info.channels };
}
// the mean colour of each cell of a COLS x ROWS grid over an equirectangular image (skip(R, G, B) leaves pixels out)
function cellMeans(img, COLS, ROWS, skip) {
  const out = new Float32Array(COLS * ROWS * 3), bx = img.W / COLS, by = img.H / ROWS;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    let n = 0, r = 0, g = 0, b = 0;
    for (let Y = Math.floor(y * by); Y < Math.floor((y + 1) * by); Y++) for (let X = Math.floor(x * bx); X < Math.floor((x + 1) * bx); X++) {
      const i = (Y * img.W + X) * img.C, R = img.data[i] / 255, G = img.data[i + 1] / 255, B = img.data[i + 2] / 255;
      if (skip && skip(R, G, B)) continue;
      n++; r += R; g += G; b += B;
    }
    const k = (y * COLS + x) * 3;
    if (n) { out[k] = r / n; out[k + 1] = g / n; out[k + 2] = b / n; } else out[k] = out[k + 1] = out[k + 2] = -1;
  }
  return out;
}
// k-means in RGB over the listed cells; returns the palette (darkest first) and each cell's palette index
function palette(colors, cells, K) {
  const byLum = [...cells].sort((p, q) => lum([colors[p * 3], colors[p * 3 + 1], colors[p * 3 + 2]]) - lum([colors[q * 3], colors[q * 3 + 1], colors[q * 3 + 2]]));
  let centers = Array.from({ length: K }, (_, i) => { const k = byLum[Math.floor((i + 0.5) * byLum.length / K)] * 3; return [colors[k], colors[k + 1], colors[k + 2]]; });
  const assign = new Int16Array(colors.length / 3).fill(-1);
  const nearest = (r, g, b) => { let best = 0, bd = 1e9; centers.forEach((c, i) => { const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2; if (d < bd) { bd = d; best = i; } }); return best; };
  for (let it = 0; it < 15; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (const k of cells) { const c = nearest(colors[k * 3], colors[k * 3 + 1], colors[k * 3 + 2]); assign[k] = c; const s = sum[c]; s[0] += colors[k * 3]; s[1] += colors[k * 3 + 1]; s[2] += colors[k * 3 + 2]; s[3]++; }
    centers = centers.map((c, i) => sum[i][3] ? [sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3]] : c);
  }
  centers = centers.map(c => c.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255) / 255));
  const order = centers.map((_, i) => i).sort((p, q) => lum(centers[p]) - lum(centers[q]));
  const remap = new Int16Array(K); order.forEach((old, i) => { remap[old] = i; });
  for (let k = 0; k < assign.length; k++) if (assign[k] >= 0) assign[k] = remap[assign[k]];
  return { centers: order.map(i => centers[i]), assign };
}
// a horizontal majority filter, so the Svg's runs are longer (each cell takes the most common index of its 5 neighbours)
function smoothRuns(index, COLS, ROWS) {
  const out = new Int16Array(index);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const count = new Map();
    for (let d = -2; d <= 2; d++) { const v = index[y * COLS + ((x + d + COLS) % COLS)]; count.set(v, (count.get(v) ?? 0) + 1); }
    let best = index[y * COLS + x], bc = 0;
    for (const [v, c] of count) if (c > bc || (c === bc && v === index[y * COLS + x])) { best = v; bc = c; }
    out[y * COLS + x] = best;
  }
  return out;
}

// Earth: Natural Earth's land, Blue Marble's colour over the land, Black Marble's city lights
function readPolygons(file) {
  const b = fs.readFileSync(file), rings = [];
  for (let o = 100; o < b.length;) {
    const len = b.readInt32BE(o + 4) * 2, c = o + 8;
    if (b.readInt32LE(c) === 5) {
      const nParts = b.readInt32LE(c + 36), nPts = b.readInt32LE(c + 40), pts = c + 44 + nParts * 4;
      for (let p = 0; p < nParts; p++) {
        const s = b.readInt32LE(c + 44 + p * 4), e = p + 1 < nParts ? b.readInt32LE(c + 44 + (p + 1) * 4) : nPts, ring = [];
        for (let i = s; i < e; i++) ring.push([b.readDoubleLE(pts + i * 16), b.readDoubleLE(pts + i * 16 + 8)]);
        rings.push(ring);
      }
    }
    o = c + len;
  }
  return rings;
}
async function earthMap() {
  const COLS = 360, ROWS = 180, SUB = 3, K = 10;
  const rings = readPolygons(path.join(DATA, 'ne_50m_land', 'ne_50m_land.shp'));
  const landFrac = new Float32Array(COLS * ROWS);
  for (let sy = 0; sy < ROWS * SUB; sy++) {
    const lat = 90 - (sy + 0.5) * 180 / (ROWS * SUB), xs = [];
    for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[j];
      if ((y1 > lat) !== (y2 > lat)) xs.push(x1 + (lat - y1) * (x2 - x1) / (y2 - y1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let sx = 0; sx < COLS * SUB; sx++) {
      const lon = -180 + (sx + 0.5) * 360 / (COLS * SUB);
      if (lon >= xs[k] && lon < xs[k + 1]) landFrac[Math.floor(sy / SUB) * COLS + Math.floor(sx / SUB)] += 1 / (SUB * SUB);
    }
  }
  const isLand = k => landFrac[k] >= 0.5;
  const colors = cellMeans(await raw(path.join(DATA, 'bluemarble-2048.png')), COLS, ROWS, (R, G, B) => B > R + 0.08 && B > G);
  for (let k = 0; k < COLS * ROWS; k++) if (colors[k * 3] < 0) { colors[k * 3] = 0.3; colors[k * 3 + 1] = 0.36; colors[k * 3 + 2] = 0.22; }
  const land = []; for (let k = 0; k < COLS * ROWS; k++) if (isLand(k)) land.push(k);
  const { centers, assign } = palette(colors, land, K);
  const meta = await sharp(path.join(DATA, 'BlackMarble_2016_global_7km.png')).metadata();
  const black = await raw(path.join(DATA, 'BlackMarble_2016_global_7km.png'), { left: 0, top: 0, width: meta.width, height: Math.floor(meta.width / 2) });
  const lights = new Uint8Array(COLS * ROWS), bx = black.W / COLS, by = black.H / ROWS;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const k = y * COLS + x;
    if (landFrac[k] < 0.2) continue;
    let n = 0, lit = 0, hot = 0;
    for (let Y = Math.floor(y * by); Y < Math.floor((y + 1) * by); Y++) for (let X = Math.floor(x * bx); X < Math.floor((x + 1) * bx); X++) {
      const i = (Y * black.W + X) * black.C, R = black.data[i], G = black.data[i + 1], B = black.data[i + 2];
      n++;
      if (R > 90 && G > 70 && R > B * 1.25) { lit++; if (R > 200 && G > 170) hot++; }
    }
    lights[k] = hot / n > 0.06 || lit / n > 0.35 ? 2 : lit / n > 0.05 ? 1 : 0;
  }
  // index 0 the sea, 1..K the land palette, K + 1 and K + 2 the dim and bright city lights
  const index = new Int16Array(COLS * ROWS);
  for (let k = 0; k < COLS * ROWS; k++) index[k] = lights[k] === 2 ? K + 2 : lights[k] === 1 ? K + 1 : isLand(k) ? 1 + assign[k] : 0;
  const pal = [[0, 0, 0], ...centers, [1, 0.55, 0.16], [1, 0.86, 0.55]];
  return { COLS, ROWS, index, pal, extra: { CITY_DIM_INDEX: K + 1, CITY_BRIGHT_INDEX: K + 2 } };
}

// the other bodies: a 16-colour palette over the whole map, smoothed until the Svg fits
async function rockMap(spec, COLS, ROWS) {
  let img = await raw(path.join(DATA, spec.file));
  const colors = cellMeans(img, COLS, ROWS);
  if (spec.shiftHalf) {   // a map centred on 180 degrees east: move it to centre on 0
    const copy = Float32Array.from(colors);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) for (let c = 0; c < 3; c++) colors[(y * COLS + x) * 3 + c] = copy[(y * COLS + (x + COLS / 2) % COLS) * 3 + c];
  }
  if (spec.desaturate) for (let k = 0; k < COLS * ROWS; k++) {
    const c = [colors[k * 3], colors[k * 3 + 1], colors[k * 3 + 2]], l = lum(c);
    for (let i = 0; i < 3; i++) colors[k * 3 + i] = Math.min(1, (c[i] + (l - c[i]) * spec.desaturate) * (spec.tint?.[i] ?? 1));
  }
  const all = Array.from({ length: COLS * ROWS }, (_, k) => k);
  const { centers, assign } = palette(colors, all, 16);
  // the darkest and palest palette colours' brightness, which the shader stretches between
  const lums = centers.map(lum);
  return { COLS, ROWS, index: smoothRuns(assign, COLS, ROWS), pal: centers, extra: {}, lumLo: Math.min(...lums), lumHi: Math.max(...lums) };
}

// ---------------------------------------------------------------- the map in the Svg, in index colours a step off the backdrop
const MAP = { x: 0.015, y: 0.03, w: 0.3, h: 0.24 };
const indexColor = (base, i) => '#' + [base[0] + 2 * (i & 3), base[1] + 2 * (i >> 2), base[2]].map(v => v.toString(16).padStart(2, '0')).join('');
function mapSvg(map, base) {
  const runs = new Map(), bg = indexColor(base, 0);
  for (let y = 0; y < map.ROWS; y++) {
    let x = 0;
    while (x < map.COLS) {
      const i = map.index[y * map.COLS + x];
      let e = x + 1;
      while (e < map.COLS && map.index[y * map.COLS + e] === i) e++;
      if (i !== 0) {
        const col = indexColor(base, i);
        if (!runs.has(col)) runs.set(col, { d: '', y: -1, end: 0 });
        const r = runs.get(col);
        r.d += r.y === y ? `m${x - r.end} 0h${e - x}` : `M${x} ${y}.5h${e - x}`;
        r.y = y; r.end = e;
      }
      x = e;
    }
  }
  let s = `<svg x="${MAP.x * 100}%" y="${MAP.y * 100}%" width="${MAP.w * 100}%" height="${MAP.h * 100}%" viewBox="0 0 ${map.COLS} ${map.ROWS}" preserveAspectRatio="none">`
    + `<rect width="${map.COLS}" height="${map.ROWS}" fill="${bg}"/>`;
  for (const [col, r] of runs) s += `<path fill="none" stroke="${col}" d="${r.d}"/>`;
  return s + '</svg>';
}

// ---------------------------------------------------------------- the still body: the shader's look, in JS, at time 0
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const level = b => 1 + Math.max(0, Math.min(LEVELS - 1, Math.floor(b * LEVELS)));
function starHash(x, y) { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) & 65535) / 65536; }
function hash3(x, y, z) { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) & 65535) / 65536; }
function noise(px, py, pz) {
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz), fx = px - ix, fy = py - iy, fz = pz - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz), m = (a, b, t) => a + (b - a) * t;
  const a = m(m(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), ux), m(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), ux), uy);
  const b = m(m(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), ux), m(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), ux), uy);
  return m(a, b, uz);
}
function ringAt(r) {
  const c = smooth(1.24, 1.3, r) * (1 - smooth(1.5, 1.53, r)) * 0.35;
  const b = smooth(1.52, 1.56, r) * (1 - smooth(1.93, 1.95, r)) * (0.8 + 0.2 * Math.sin(r * 60));
  const a = smooth(2.02, 2.04, r) * (1 - smooth(2.25, 2.27, r)) * 0.6;
  const encke = 1 - 0.8 * smooth(2.21, 2.215, r) * (1 - smooth(2.225, 2.23, r));
  return (c + b + a) * encke;
}
function stillShade(name, body, map, col, row, X) {
  const has = f => body.flags.includes(f), K = { ...body.consts };
  const px = (col + 0.5) * X.CW, py = (row + 0.5) * X.CH;
  const R0 = Math.min(X.VH * 0.40, X.VW * 0.27), R = R0 * K.BODY_SCALE;
  const qx = (px - X.VW * 0.70) / R, qy = -(py - X.VH * 0.45) / R, r2 = qx * qx + qy * qy;
  const s = body.stillSun;
  let g = 0, color = rgb(body.space);
  const mapAt = (lat, lon) => {
    const x = Math.floor((((lon / 360 + 0.5) % 1) + 1) % 1 * map.COLS), y = Math.min(map.ROWS - 1, Math.max(0, Math.floor((0.5 - lat / 180) * map.ROWS)));
    return map.index[y * map.COLS + x];
  };
  if (r2 < 1) {
    const z = Math.sqrt(1 - r2), T = K.TILT;
    const y1 = qy * Math.cos(T) + z * Math.sin(T), z1 = z * Math.cos(T) - qy * Math.sin(T);
    const spin = (-90 - K.LON0) * rad;
    const nx = qx * Math.cos(spin) - z1 * Math.sin(spin), nz = qx * Math.sin(spin) + z1 * Math.cos(spin);
    const lat = Math.atan2(y1, Math.hypot(nx, nz)), lon = Math.atan2(-nz, nx), limb = 0.62 + 0.38 * z;
    const l = has('BODYSUN') ? nx * s[0] + y1 * s[1] + nz * s[2] : qx * s[0] + qy * s[1] + z * s[2];
    const day = smooth(-0.06, 0.3, l), night = smooth(0.04, -0.12, l);
    if (has('EARTH')) {
      const idx = mapAt(lat / rad, lon / rad), c = map.pal[idx];
      const city = idx >= map.extra.CITY_DIM_INDEX, bright = idx >= map.extra.CITY_BRIGHT_INDEX;
      if (idx === 0) {
        const shine = Math.pow(Math.max(0, l), 80) * z;
        g = night > 0.9 ? (starHash(col, row) < 0.35 ? 1 : 0) : level((0.06 + 0.2 * day) * limb + 0.3 * shine * day);
        color = mixc(mixc(rgb(K.SEA_NIGHT), rgb(K.SEA_DAY), day), rgb(K.GLINT), Math.min(1, shine * 1.5) * day);
      } else {
        const land = city ? rgb(K.URBAN) : c, peak = Math.max(...land), hue = land.map(v => v / Math.max(peak, 0.04));
        if (city && night > 0.3) { g = level((bright ? 0.75 : 0.45) * night + 0.08); color = bright ? rgb(K.CITY_BRIGHT) : rgb(K.CITY_DIM); }
        else if (night > 0.6) { g = level(0.16 * limb); color = mixc(hue, [0.6, 0.6, 0.6], 0.55).map(v => v * 0.42); }
        else {
          const tone = mixc(land.map(v => Math.min(1, v * 1.7)), hue, 0.3);
          g = level(Math.min(0.72, (0.2 + 0.8 * day) * (0.45 + 0.55 * Math.sqrt(lum(land))) * limb));
          color = tone.map(v => v * (0.55 + 0.45 * day));
        }
      }
    } else if (has('ROCK')) {
      const c = map.pal[mapAt(lat / rad, lon / rad)], peak = Math.max(...c), hue = c.map(v => v / Math.max(peak, 0.04));
      const tone = mixc(c.map(v => Math.min(1, v * K.BRIGHTEN)), hue, 0.25), L = Math.min(1, Math.max(0, (lum(c) - map.lumLo) / (map.lumHi - map.lumLo)));
      if (night > 0.6) { g = level(K.NIGHT_GLOW * limb * (0.5 + 0.5 * L)); color = mixc(tone, [0.55, 0.6, 0.7], 0.5).map(v => v * 0.4); }
      else { g = level(Math.min(0.8, (0.12 + 0.88 * day) * (0.18 + 0.82 * L) * limb)); color = tone.map(v => v * (0.5 + 0.5 * day)); }
    } else if (has('SATURN')) {
      const f = Math.min(15.999, Math.max(0, (0.5 - lat / Math.PI) * 16)), i = Math.floor(f);
      const band = mixc(rgb(body.bands[i]), rgb(body.bands[Math.min(i + 1, 15)]), smooth(0.2, 0.8, f - i));
      const hexA = Math.atan2(nz, nx), hexR = Math.cos(Math.PI / 6) / Math.cos(hexA - (Math.PI / 3) * Math.floor(hexA / (Math.PI / 3) + 0.5));
      const hex = smooth(0.03, 0, Math.abs(Math.PI / 2 - lat - 0.22 * hexR)) * smooth(0.9, 1.2, lat);
      const ct = Math.cos(T), st = Math.sin(T), nDot = s[1] * ct + s[2] * st;
      const t = -(qy * ct + z * st) / (Math.abs(nDot) > 0.001 ? nDot : 0.001);
      const shadow = t > 0 ? ringAt(Math.hypot(qx + t * s[0], qy + t * s[1], z + t * s[2])) : 0;
      const lit = day * (1 - 0.75 * Math.min(1, shadow * 1.6));
      g = night > 0.7 ? level(0.05 * limb) : level(Math.min(0.75, (0.15 + 0.75 * lit) * limb));
      color = mixc(band, [0.35, 0.3, 0.22], hex * 0.7).map(v => v * (0.45 + 0.55 * lit));
    } else if (has('SUN')) {
      const gran = noise(nx * 22, y1 * 22, nz * 22), spotN = noise(nx * 6 + 11, y1 * 6, nz * 6);
      const belt = smooth(0.65, 0.3, Math.abs(lat)) * smooth(0.05, 0.15, Math.abs(lat)), spot = smooth(0.8, 0.85, spotN) * belt;
      const ld = Math.pow(z, 0.55);
      g = level(Math.min(0.95, ld * (0.62 + 0.38 * gran) * (1 - 0.75 * spot)));
      color = mixc(rgb(K.SUN_LIMB), rgb(K.SUN_CORE), ld).map(v => v * (1 - 0.45 * spot));
    }
  } else {
    const rr = Math.sqrt(r2);
    if (has('RIM') && rr < K.RIM_OUT) { g = 1 + Math.min(1, Math.floor((K.RIM_OUT - rr) * 12)); color = rgb(K.RIM); }
    if (has('SUN') && rr < 1.55) {
      const ang = Math.atan2(qy, qx), streak = noise(Math.cos(ang) * 3 + 5, Math.sin(ang) * 3 + 5, 0), fall = Math.pow(1 - (rr - 1) / 0.55, 2.2);
      g = rr < 1.04 ? level(0.5) : level(Math.min(0.5, fall * (0.25 + 0.6 * streak)));
      color = mixc(rgb(K.SUN_LIMB), [1, 0.85, 0.6], 0.3).map(v => v * (0.55 + 0.45 * fall));
    }
    if (!g) { const h = starHash(col, row); if (h < 0.006) { g = starOf('.'); color = rgb(STAR); } else if (h < 0.008) { g = starOf('+'); color = rgb(STAR); } }
  }
  if (body.flags.includes('SATURN')) {
    const T = K.TILT, ct = Math.cos(T), st = Math.sin(T), zr = -qy * ct / st, rr = Math.hypot(qx, qy, zr), ring = ringAt(rr);
    if (ring > 0.05 && (r2 >= 1 || zr > Math.sqrt(Math.max(0, 1 - r2)))) {
      const along = qx * s[0] + qy * s[1] + zr * s[2], ox = qx - along * s[0], oy = qy - along * s[1], oz = zr - along * s[2];
      const b = ring * (along < 0 && ox * ox + oy * oy + oz * oz < 1 ? 0.15 : 1);
      g = level(Math.min(0.7, 0.08 + 0.62 * b)); color = rgb(K.RING_COLOR).map(v => v * (0.45 + 0.55 * b));
    }
  }
  return g ? { g, color } : null;
}
function stillSvg(name, body, map) {
  const X = { VW: 1600, VH: 1000, CW: 9, CH: 14 };
  const esc = ch => ch === '&' ? '&amp;' : ch;
  let out = '';
  for (let row = 0; row < Math.ceil(X.VH / X.CH); row++) {
    const cells = [];
    for (let col = 0; col < Math.ceil(X.VW / X.CW); col++) cells.push(stillShade(name, body, map, col, row, X));
    const first = cells.findIndex(Boolean);
    if (first < 0) continue;
    let last = cells.length - 1; while (!cells[last]) last--;
    let runs = '', cur = null, text = '';
    for (let col = first; col <= last; col++) {
      const s = cells[col];
      if (s && hex1(s.color) !== cur) { if (text) runs += `<tspan fill="${cur}">${text}</tspan>`; cur = hex1(s.color); text = ''; }
      text += s ? esc(ramp[s.g - 1].c) : ' ';
    }
    runs += `<tspan fill="${cur}">${text}</tspan>`;
    out += `<text x="${first * X.CW}" y="${(row + 1) * X.CH - 3}" textLength="${(last - first + 1) * X.CW}" lengthAdjust="spacing">${runs}</text>`;
  }
  return `<svg width="100%" height="100%" viewBox="0 0 ${X.VW} ${X.VH}" preserveAspectRatio="xMidYMid meet">`
    + `<style>text{font-family:monospace;font-size:${X.CH}px;white-space:pre}</style>${out}</svg>`;
}

// ---------------------------------------------------------------- generated sources
function preprocess(src, flags) {
  const lines = src.split('\n'), out = [], stack = [];
  for (const line of lines) {
    const m = line.match(/^\s*\/\/ #(if|endif)\s*(\w*)/);
    if (m) { if (m[1] === 'if') stack.push(flags.includes(m[2])); else stack.pop(); continue; }
    if (stack.every(Boolean)) out.push(line);
  }
  if (stack.length) throw new Error('unbalanced #if');
  return out.join('\n');
}
const tsValue = v => typeof v === 'string' && v.startsWith('#') ? `vec3(${rgb(v).map(x => +x.toFixed(4)).join(', ')})` : String(v);
function shaderFor(name, body, map) {
  const consts = {
    ...body.consts, SPACE: body.space, STAR,
  };
  const block = [
    `// written by tools/build.mjs for ${body.label}: do not edit by hand`,
    `const GLYPH = table([${['[0,0]', ...ramp.map(g => `[${g.lo},${g.hi}]`)].join(',')}], 'int')   // ${ramp.map(g => g.c).join('')}`,
    `const LEVELS = ${LEVELS}, STAR_DOT = ${starOf('.')}, STAR_PLUS = ${starOf('+')}`,
    ...Object.entries(consts).map(([k, v]) => `const ${k} = ${tsValue(v)}`),
  ];
  if (map) {
    block.push(`const MAP_X = ${MAP.x}, MAP_Y = ${MAP.y}, MAP_W = ${MAP.w}, MAP_H = ${MAP.h}, MAP_COLS = ${map.COLS}, MAP_ROWS = ${map.ROWS}   // the index map's box (y down)`);
    block.push(`const PALETTE = table([${Array.from({ length: 16 }, (_, i) => '[' + (map.pal[i] ?? [0, 0, 0]).map(v => Math.round(v * 255)).join(',') + ']').join(',')}], 'int')`);
    for (const [k, v] of Object.entries(map.extra)) block.push(`const ${k} = ${v}`);
    if (map.lumHi !== undefined) block.push(`const LUM_LO = ${map.lumLo.toFixed(4)}, LUM_HI = ${map.lumHi.toFixed(4)}`);
  }
  if (body.bands) block.push(`const BANDS = table([${body.bands.map(h => '[' + rgb(h).map(v => Math.round(v * 255)).join(',') + ']').join(',')}], 'int')`);
  let src = preprocess(fs.readFileSync(path.join(SRC, 'body.shader.ts'), 'utf8'), body.flags);
  src = src.replace(/\/\/ @generated start\n\/\/ @generated end/, '// @generated start\n' + block.join('\n') + '\n// @generated end');
  // the map's index colours start from the backdrop's own colour, a step or two off it
  const base = rgb(body.space).map(v => Math.round(v * 255));
  src = src.replace('(s.r * 255 - 5) / 2', `(s.r * 255 - ${base[0]}) / 2`).replace('(s.g * 255 - 7) / 2', `(s.g * 255 - ${base[1]}) / 2`);
  src = src.replace(/^\/\/ This is the template[\s\S]*?@generated block\.\n/m, '');
  // imports the body does not use would only add noise: leave them as they are, the checker allows them
  return src;
}
function lookFor(body) {
  const s0 = rgb(body.space), lift = d => hex2(s0.map(v => Math.min(1, v + d)));
  return {
    label: `ASCII ${body.label.replace(/^the /, '')}`,
    only: 'dark',
    roles: { accent: body.accent, danger: '#e0604f', success: '#5aa23f', warning: '#e0a23f', pro: '#a07ce0' },
    dark: { gray: { anchors: { 'surface-0': hex2(s0), 'surface-1': lift(0.025), 'surface-2': lift(0.045), 'surface-3': lift(0.07), 'text-primary': '#ece8e2', 'text-secondary': '#bfb8ae', 'text-muted': '#9a9389' } } },
  };
}

// ---------------------------------------------------------------- build each body
const built = {};
for (const name of WEEK) {
  const body = BODIES[name];
  body.stillSun = body.sun === 'earth'
    ? (() => { const la = 5 * rad, lo = -55 * rad; return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)]; })()
    : body.sun === 'moon' ? [Math.sin(120 * rad), 0, -Math.cos(120 * rad)] : FIXED_SUN;
  let map = null, svg = '';
  const base = rgb(body.space).map(v => Math.round(v * 255));
  const tries = body.map?.earth ? [[360, 180]] : body.map ? [[360, 180], [300, 150], [240, 120], [180, 90]] : [null];
  for (const t of tries) {
    map = body.map ? (body.map.earth ? await earthMap() : await rockMap(body.map, t[0], t[1])) : null;
    const mapPart = map ? mapSvg(map, base) : '';
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><rect width="100%" height="100%" fill="${body.space}"/>${mapPart}${stillSvg(name, body, map ?? { index: [], pal: [] })}</svg>`;
    if (svg.length < 126000) break;
  }
  assert(svg.length < 131072, `${name}: Svg ${svg.length} characters${map ? `, map ${map.COLS} x ${map.ROWS}` : ''}`);
  const look = lookFor(body);
  const unpainted = makeColors(look).problems.filter(p => p.startsWith("Desktop won't paint"));
  assert(!unpainted.length, `${name}: the look paints${unpainted.length ? ' (' + unpainted[0] + ')' : ''}`);
  built[name] = { map, svg, look, shader: shaderFor(name, body, map) };
}

// known places, read back from the maps as the shader reads them
{
  const at = (name, lat, lon) => { const m = built[name].map; const x = Math.floor((lon / 360 + 0.5) * m.COLS) % m.COLS, y = Math.min(m.ROWS - 1, Math.floor((0.5 - lat / 180) * m.ROWS)); return m.index[y * m.COLS + x]; };
  const pal = (name, lat, lon) => built[name].map.pal[at(name, lat, lon)];
  const e = built.earth.map;
  assert(at('earth', 0, -30) === 0, 'Earth: the mid-Atlantic is sea');
  { const c = pal('earth', -3, -62); assert(at('earth', -3, -62) > 0 && c[1] > c[0] && c[1] > c[2], 'Earth: the Amazon is green'); }
  { const c = pal('earth', 23, 10); assert(c[0] > c[1] && c[1] > c[2] && c[0] > 0.5, 'Earth: the Sahara is tan'); }
  assert(Math.min(...pal('earth', 75, -40)) > 0.7, 'Earth: Greenland is white');
  assert(at('earth', 40.7, -74) >= e.extra.CITY_DIM_INDEX, 'Earth: New York is lit');
  assert(lum(pal('moon', 33, -16)) < lum(pal('moon', -40, 10)) - 0.08, 'Moon: Mare Imbrium is darker than the southern highlands');
  { const c = pal('mars', -5, 30); assert(c[0] > c[1] * 1.15 && c[1] > c[2], 'Mars: Arabia Terra is rust-red'); }
  assert(lum(pal('mars', 87, 0)) > lum(pal('mars', 0, 0)) + 0.15, 'Mars: the north polar cap is bright');
  { const c = pal('mercury', 0, 0); assert(Math.max(...c) - Math.min(...c) < 0.12, 'Mercury: muted to grey-brown'); }
  { const rows = new Set(); const m = built.jupiter.map; for (let y = 40; y < 140; y += 10) rows.add(m.index[y * m.COLS + 10]); assert(rows.size >= 4, 'Jupiter: bands change with latitude'); }
}
if (failed) { console.error('build stopped: a check failed'); process.exit(1); }

// ---------------------------------------------------------------- write the mods
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const copyShared = dir => {
  for (const f of ['make-colors.js', 'make-colors.d.ts', 'sun.ts']) fs.copyFileSync(path.join(SRC, f), path.join(dir, 'hooks', f));
};
const header = what => `// written by tools/build.mjs: ${what}\n`;
fs.rmSync(OUT, { recursive: true, force: true });
const manifest = (name, description) => JSON.stringify({ name, version: VERSION, description, author: { name: 'bluetyde' }, license: 'MIT' }, null, 2) + '\n';
const fill = (src, block) => src.replace(/\/\/ @generated start\n\/\/ @generated end/, '// @generated start\n' + block + '\n// @generated end');

for (const name of WEEK) {
  const body = BODIES[name], dir = path.join(OUT, `ascii-${name}`), b = built[name];
  write(path.join(dir, '.claude-plugin', 'plugin.json'), manifest(`ascii-${name}`, `A backdrop of ${body.label} drawn in ASCII glyphs, every day`));
  write(path.join(dir, 'hooks', 'hooks.json'), '{ "modules": ["./register.tsx"] }\n');
  write(path.join(dir, 'hooks', `${name}.shader.ts`), b.shader);
  write(path.join(dir, 'hooks', 'scene.ts'), header(`${body.label} as the Svg under the shader`) + `export const SCENE = ${JSON.stringify(b.svg)}\n`);
  const block = [
    `const SCENE_ID = 'ascii-${name}'`,
    `const ALT = ${JSON.stringify(body.alt)}`,
    `const SUN_MODE = '${body.sun}' as SunMode`,
    `const GLASS = '${body.space}'`,
    `const LOOK: Parameters<typeof makeColors>[0] = ${JSON.stringify(b.look)}`,
  ].join('\n');
  write(path.join(dir, 'hooks', 'register.tsx'), fill(fs.readFileSync(path.join(SRC, 'register.tsx'), 'utf8'), block).replace('"./SHADER_FILE"', `"./${name}.shader.ts"`).replace(/^\/\/ One body's backdrop.*\n/, `// ${body.label}'s backdrop, every day. Written by tools/build.mjs from src/register.tsx: do not edit by hand.\n`));
  copyShared(dir);
}
{
  const dir = path.join(OUT, 'ascii-week');
  write(path.join(dir, '.claude-plugin', 'plugin.json'), manifest('ascii-week', 'A backdrop for each day of the week: Sun, Moon, Mars, Mercury, Jupiter, Earth, Saturn, drawn in ASCII glyphs'));
  write(path.join(dir, 'hooks', 'hooks.json'), '{ "modules": ["./register.tsx"] }\n');
  for (const name of WEEK) {
    write(path.join(dir, 'hooks', `${name}.shader.ts`), built[name].shader);
    write(path.join(dir, 'hooks', `${name}.scene.ts`), header(`${BODIES[name].label} as the Svg under the shader`) + `export const SCENE = ${JSON.stringify(built[name].svg)}\n`);
  }
  const imports = WEEK.map(n => `import { SCENE as SCENE_${n.toUpperCase()} } from './${n}.scene'`).join('\n');
  const table = WEEK.map(n => `  ${n}: { label: ${JSON.stringify(BODIES[n].label)}, scene: 'ascii-${n}', alt: ${JSON.stringify(BODIES[n].alt)}, sun: '${BODIES[n].sun}' as SunMode, glass: '${BODIES[n].space}', look: ${JSON.stringify(built[n].look)} as Parameters<typeof makeColors>[0] },`).join('\n');
  const block = `${imports}\nimport type { SunMode } from './sun'\n\n// Sunday first, as Date.getDay counts\nconst WEEK = ${JSON.stringify(WEEK)} as const\nconst BODIES = {\n${table}\n}`;
  const render = WEEK.map(n => `    if (shown === '${n}' && e.props.scene === 'ascii-${n}') {\n      return (\n        <Shader module="./${n}.shader.ts" values={sun}>\n          <Svg source={SCENE_${n.toUpperCase()}} alt={BODIES.${n}.alt} isInteractive />\n        </Shader>\n      )\n    }`).join('\n');
  let src = fill(fs.readFileSync(path.join(SRC, 'week.tsx'), 'utf8'), block);
  src = src.replace(/    \/\/ @generated-render start\n    \/\/ @generated-render end/, render);
  src = src.replace('// tools/build.mjs writes this file into the week mod and fills the @generated block.', '// Written by tools/build.mjs from src/week.tsx: do not edit by hand.');
  write(path.join(dir, 'hooks', 'register.tsx'), src);
  copyShared(dir);
}
write(path.join(ROOT, '.claude-plugin', 'marketplace.json'), JSON.stringify({
  name: 'ascii-planet-backdrops',
  owner: { name: 'bluetyde' },
  description: 'Backdrops for the Claude desktop app: the Sun, the Moon and the planets drawn in ASCII glyphs, one a day or one always',
  plugins: ['week', ...WEEK].map(n => ({ name: `ascii-${n}`, source: `./plugins/ascii-${n}` })),
}, null, 2) + '\n');
// a preview of each still Svg, to look at in a browser
for (const name of WEEK) write(path.join(ROOT, 'previews', `${name}.svg`), built[name].svg);
console.log('wrote plugins/ (8 mods), .claude-plugin/marketplace.json, previews/');
