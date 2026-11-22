// Builds the data of the ascii-earth mod from three public-domain maps:
//   - Natural Earth 1:50m land polygons (ne_50m_land.shp), for land and sea;
//   - NASA Blue Marble (a 2:1 equirectangular colour map), for the colour of the land;
//   - NASA Black Marble 2016 (the "Earth at Night" print, a 2:1 map over a caption strip), for city lights.
// It writes:
//   - hooks/scene.ts: the Svg under the shader. It holds a faint 360 x 180 world map in a fixed box (the shader reads its colours
//     back with `scene`), and the still ASCII globe shown where the shader does not play;
//   - the block between the @generated markers of hooks/earth.shader.ts: the glyph bitmaps and the map's box;
//   - tools/scene-preview.svg, the same Svg, to look at.
// Usage: node tools/build-earth-data.mjs [data folder]   (default: data/ beside package.json; see the README for the files)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url)), MOD = path.resolve(HERE, '..');
const DATA = process.argv[2] ?? path.join(MOD, 'data');
const LAND_SHP = path.join(DATA, 'ne_50m_land', 'ne_50m_land.shp');
const BLUE = path.join(DATA, 'bluemarble-2048.png');
const BLACK = path.join(DATA, 'BlackMarble_2016_global_7km.png');

const COLS = 360, ROWS = 180;                 // the map: one cell a degree, row 0 at the north
const assert = (ok, what) => { if (!ok) { console.error('FAIL', what); process.exitCode = 1; } else console.log('ok  ', what); };

// ---------------------------------------------------------------- land: rasterize Natural Earth's polygons (even-odd, 3 x 3 samples a cell)
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
const rings = readPolygons(LAND_SHP);
const SUB = 3, landFrac = new Float32Array(COLS * ROWS);
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

// ---------------------------------------------------------------- colour: Blue Marble over each land cell, the sea left out
async function raw(file, crop) {
  let img = sharp(file);
  if (crop) img = img.extract(crop);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height, C: info.channels };
}
const blue = await raw(BLUE);
const cellColor = new Float32Array(COLS * ROWS * 3);
{
  const bx = blue.W / COLS, by = blue.H / ROWS;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    let n = 0, r = 0, g = 0, b = 0;
    for (let Y = Math.floor(y * by); Y < Math.floor((y + 1) * by); Y++) for (let X = Math.floor(x * bx); X < Math.floor((x + 1) * bx); X++) {
      const i = (Y * blue.W + X) * blue.C, R = blue.data[i] / 255, G = blue.data[i + 1] / 255, B = blue.data[i + 2] / 255;
      if (B > R + 0.08 && B > G) continue;      // a sea pixel
      n++; r += R; g += G; b += B;
    }
    const k = (y * COLS + x) * 3;
    if (n) { cellColor[k] = r / n; cellColor[k + 1] = g / n; cellColor[k + 2] = b / n; }
    else { cellColor[k] = 0.3; cellColor[k + 1] = 0.36; cellColor[k + 2] = 0.22; }   // land in Natural Earth the picture shows as sea
  }
}

// a palette for the land: k-means in RGB, so the Svg draws few colours
const K = 10, landCells = [];
for (let k = 0; k < COLS * ROWS; k++) if (isLand(k)) landCells.push(k);
const byLum = [...landCells].sort((p, q) => (cellColor[p * 3] + cellColor[p * 3 + 1]) - (cellColor[q * 3] + cellColor[q * 3 + 1]));
let centers = [];
for (let i = 0; i < K; i++) { const k = byLum[Math.floor((i + 0.5) * byLum.length / K)] * 3; centers.push([cellColor[k], cellColor[k + 1], cellColor[k + 2]]); }
const nearest = (r, g, b) => { let best = 0, bd = 1e9; centers.forEach((c, i) => { const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2; if (d < bd) { bd = d; best = i; } }); return best; };
const assign = new Int16Array(COLS * ROWS).fill(-1);
for (let it = 0; it < 15; it++) {
  const sum = centers.map(() => [0, 0, 0, 0]);
  for (const k of landCells) { const c = nearest(cellColor[k * 3], cellColor[k * 3 + 1], cellColor[k * 3 + 2]); assign[k] = c; const s = sum[c]; s[0] += cellColor[k * 3]; s[1] += cellColor[k * 3 + 1]; s[2] += cellColor[k * 3 + 2]; s[3]++; }
  centers = centers.map((c, i) => sum[i][3] ? [sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3]] : c);
}
// a land colour must never read as sea or as a city mark in the shader
centers = centers.map(([r, g, b]) => {
  if (b > r + 0.06 && b > g) b = Math.max(r, g) + 0.02;
  if (r > 0.82 && b < 0.17) b = 0.2;
  return [r, g, b].map(v => Math.round(v * 255) / 255);   // whole 8-bit steps: the shader's palette table holds them as ints
});
// darkest first, so a sample that lands between two neighbouring indices reads a similar colour
{
  const order = centers.map((c, i) => i).sort((p, q) => (centers[p][0] + centers[p][1] + centers[p][2]) - (centers[q][0] + centers[q][1] + centers[q][2]));
  const remap = new Int16Array(K); order.forEach((old, i) => { remap[old] = i; });
  centers = order.map(i => centers[i]);
  for (let k = 0; k < assign.length; k++) if (assign[k] >= 0) assign[k] = remap[assign[k]];
}

// ---------------------------------------------------------------- lights: Black Marble, the warm bright pixels of each cell
const blackMeta = await sharp(BLACK).metadata();
const black = await raw(BLACK, { left: 0, top: 0, width: blackMeta.width, height: Math.floor(blackMeta.width / 2) });
const lights = new Uint8Array(COLS * ROWS);   // 0 none, 1 dim, 2 bright
{
  const bx = black.W / COLS, by = black.H / ROWS;
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
}
console.log(`lights: ${[...lights].filter(Boolean).length} cells lit, ${[...lights].filter(v => v === 2).length} bright`);

// what the shader reads back, cell by cell: the sea, a city, or a palette colour
const SEA_RGB = [0.05, 0.09, 0.34], CITY_DIM = [1, 0.56, 0.02], CITY_BRIGHT = [1, 0.8, 0.02];
const mapRGB = k => lights[k] === 2 ? CITY_BRIGHT : lights[k] === 1 ? CITY_DIM : isLand(k) ? centers[assign[k]] : SEA_RGB;
const cellAt = (lat, lon) => {
  const x = Math.min(COLS - 1, Math.floor((lon / 360 + 0.5) * COLS)), y = Math.min(ROWS - 1, Math.floor((0.5 - lat / 180) * ROWS));
  return y * COLS + x;
};
{
  const amazon = mapRGB(cellAt(-3, -62)), sahara = mapRGB(cellAt(23, 10)), greenland = mapRGB(cellAt(75, -40));
  assert(isLand(cellAt(-3, -62)) && amazon[1] > amazon[0] && amazon[1] > amazon[2], 'Amazon (-3, -62) is green land');
  assert(!isLand(cellAt(0, -30)), 'mid-Atlantic (0, -30) is sea');
  assert(Math.min(...greenland) > 0.7, 'Greenland (75, -40) is ice-white');
  assert(sahara[0] > sahara[1] && sahara[1] > sahara[2] && sahara[0] > 0.5, 'Sahara (23, 10) is tan');
  assert(lights[cellAt(40.7, -74)] > 0, 'New York (40.7, -74) has lights');
  assert(lights[cellAt(-80, 0)] === 0 && lights[cellAt(0, -150)] === 0, 'Antarctica and the open Pacific are dark');
}

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
const glyphs = Object.entries(FONT).map(([c, rows]) => {
  let lo = 0, hi = 0, ink = 0;
  rows.forEach((row, r) => [...row].forEach((p, col) => {
    if (p !== '#') return;
    ink++; const bit = r * 5 + col;
    if (bit < 32) lo |= 1 << bit; else hi |= 1 << (bit - 32);
  }));
  return { c, lo, hi, ink };
}).sort((a, b) => a.ink - b.ink);
// every step of the ramp adds ink; at most 14 steps (the cell buffer keeps a glyph as a / 15)
const ramp = [];
for (const g of glyphs) if (!ramp.length || g.ink > ramp[ramp.length - 1].ink) ramp.push(g);
while (ramp.length > 14) ramp.splice(Math.floor(ramp.length / 2), 1);
console.log('ramp:', ramp.map(g => g.c).join(''), ramp.map(g => g.ink).join(' '));
const starOf = c => Math.max(1, 1 + ramp.findIndex(g => g.c === c));

// ---------------------------------------------------------------- the faint map's box in the Svg, as fractions of the window (y down)
const MAP = { x: 0.015, y: 0.03, w: 0.3, h: 0.24 };
// The map is drawn in index colours a step or two off the backdrop's own black, so no one sees it, even where the shader is not
// playing. Index i is red 5 + 2 (i & 3), green 7 + 2 (i >> 2), blue 13 (of 255): 0 the sea (the backdrop exactly), 1 to K the
// land palette, K + 1 and K + 2 the dim and bright city lights. The shader reads the index back and looks its colour up.
const CITY_DIM_INDEX = K + 1, CITY_BRIGHT_INDEX = K + 2;
const mapIndex = k => lights[k] === 2 ? CITY_BRIGHT_INDEX : lights[k] === 1 ? CITY_DIM_INDEX : isLand(k) ? 1 + assign[k] : 0;
const indexColor = i => '#' + [5 + 2 * (i & 3), 7 + 2 * (i >> 2), 13].map(v => v.toString(16).padStart(2, '0')).join('');
const SPACE = '#05070d';
const hex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(Math.min(1, Math.max(0, v)) * 15).toString(16)).join('');   // #rgb: 16 steps a channel
// one path a colour, one horizontal run of cells a subpath, stroked 1 cell high
function mapSvg() {
  const runs = new Map(), sea = indexColor(0);
  for (let y = 0; y < ROWS; y++) {
    let x = 0;
    while (x < COLS) {
      const col = indexColor(mapIndex(y * COLS + x));
      let e = x + 1;
      while (e < COLS && indexColor(mapIndex(y * COLS + e)) === col) e++;
      if (col !== sea) {
        if (!runs.has(col)) runs.set(col, { d: '', y: -1, end: 0 });
        const r = runs.get(col);
        r.d += r.y === y ? `m${x - r.end} 0h${e - x}` : `M${x} ${y}.5h${e - x}`;
        r.y = y; r.end = e;
      }
      x = e;
    }
  }
  let s = `<svg x="${MAP.x * 100}%" y="${MAP.y * 100}%" width="${MAP.w * 100}%" height="${MAP.h * 100}%" viewBox="0 0 ${COLS} ${ROWS}" preserveAspectRatio="none">`
    + `<rect width="${COLS}" height="${ROWS}" fill="${sea}"/>`;
  for (const [col, r] of runs) s += `<path fill="none" stroke="${col}" d="${r.d}"/>`;
  return s + '</svg>';
}

// ---------------------------------------------------------------- the still globe: the shader's look, at a fixed moment
const VW = 1600, VH = 1000, CW = 9, CH = 14;
const GCOLS = Math.ceil(VW / CW), GROWS = Math.ceil(VH / CH);
const R = Math.min(VH * 0.40, VW * 0.27), CX = VW * 0.70, CY = VH * (1 - 0.55);
const rad = Math.PI / 180, TILT = 0.30, SPIN = (-90 - -30) * rad;    // the Atlantic faces the viewer
const sun = (() => { const la = 5 * rad, lo = -55 * rad; return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)]; })();
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const level = b => 1 + Math.max(0, Math.min(ramp.length - 1, Math.floor(b * ramp.length)));
function hash(x, y) { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) & 65535) / 65536; }
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function shade(col, row) {
  const px = (col + 0.5) * CW, py = (row + 0.5) * CH;
  const qx = (px - CX) / R, qy = -(py - CY) / R, r2 = qx * qx + qy * qy;
  if (r2 >= 1) {
    if (r2 < 1.13) return { g: 1 + Math.min(1, Math.floor((1.13 - r2) * 12)), color: [0.31, 0.561, 0.878] };
    const h = hash(col, row);
    if (h < 0.006) return { g: starOf('.'), color: [0.541, 0.576, 0.651] };
    if (h < 0.008) return { g: starOf('+'), color: [0.541, 0.576, 0.651] };
    return null;
  }
  const z = Math.sqrt(1 - r2);
  const y1 = qy * Math.cos(TILT) + z * Math.sin(TILT), z1 = z * Math.cos(TILT) - qy * Math.sin(TILT);
  const nx = qx * Math.cos(SPIN) - z1 * Math.sin(SPIN), nz = qx * Math.sin(SPIN) + z1 * Math.cos(SPIN);
  const lat = Math.atan2(y1, Math.hypot(nx, nz)) / rad, lon = Math.atan2(-nz, nx) / rad;
  const k = cellAt(lat, lon), c = mapRGB(k);
  const l = nx * sun[0] + y1 * sun[1] + nz * sun[2];
  const day = smooth(-0.06, 0.3, l), night = smooth(0.04, -0.12, l), limb = 0.62 + 0.38 * z;
  if (!isLand(k) && !lights[k]) {
    const shine = Math.pow(Math.max(0, l), 80) * z;
    const g = night > 0.9 ? (hash(col, row) < 0.35 ? 1 : 0) : level((0.06 + 0.2 * day) * limb + 0.3 * shine * day);
    if (!g) return null;
    return { g, color: mixc(mixc([0.07, 0.1, 0.2], [0.16, 0.33, 0.6], day), [0.85, 0.93, 1], Math.min(1, shine * 1.5) * day) };
  }
  const city = lights[k] > 0, land = city ? [0.58, 0.52, 0.42] : c;
  const peak = Math.max(...land), hue = land.map(v => v / Math.max(peak, 0.04));
  const lum = 0.3 * land[0] + 0.59 * land[1] + 0.11 * land[2];
  if (city && night > 0.3) return { g: level((lights[k] === 2 ? 0.75 : 0.45) * night + 0.08), color: lights[k] === 2 ? [1, 0.86, 0.55] : [1, 0.55, 0.16] };
  if (night > 0.6) return { g: level(0.16 * limb), color: mixc(hue, [0.6, 0.6, 0.6], 0.55).map(v => v * 0.42) };
  const tone = mixc(land.map(v => Math.min(1, v * 1.7)), hue, 0.3);
  return { g: level(Math.min(0.72, (0.2 + 0.8 * day) * (0.45 + 0.55 * Math.sqrt(lum)) * limb)), color: tone.map(v => v * (0.55 + 0.45 * day)) };
}
const esc = ch => ch === '&' ? '&amp;' : ch;
let globe = '';
for (let row = 0; row < GROWS; row++) {
  const cells = [];
  for (let col = 0; col < GCOLS; col++) cells.push(shade(col, row));
  const first = cells.findIndex(Boolean);
  if (first < 0) continue;
  let last = cells.length - 1; while (!cells[last]) last--;
  let runs = '', cur = null, text = '';
  for (let col = first; col <= last; col++) {
    const s = cells[col];
    if (s && hex(s.color) !== cur) { if (text) runs += `<tspan fill="${cur}">${text}</tspan>`; cur = hex(s.color); text = ''; }
    text += s ? esc(ramp[s.g - 1].c) : ' ';
  }
  runs += `<tspan fill="${cur}">${text}</tspan>`;
  globe += `<text x="${first * CW}" y="${(row + 1) * CH - 3}" textLength="${(last - first + 1) * CW}" lengthAdjust="spacing">${runs}</text>`;
}

const mapPart = mapSvg();
// no viewBox on the root: its units are the window's own, so the map's box is a fixed share of the window (what the shader
// reads) and the globe, in its own viewBox, stays round
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">`
  + `<rect width="100%" height="100%" fill="${SPACE}"/>` + mapPart
  + `<svg width="100%" height="100%" viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid meet">`
  + `<style>text{font-family:monospace;font-size:${CH}px;white-space:pre}</style>` + globe + '</svg></svg>';
assert(indexColor(0) === SPACE && new Set(Array.from({ length: 16 }, (_, i) => indexColor(i))).size === 16, 'map index colours are distinct and the sea is the backdrop');
assert(svg.length < 131072, `Svg is ${svg.length} characters (cap 131072): map ${mapPart.length}, globe ${globe.length}`);

// ---------------------------------------------------------------- write
const shaderPath = path.join(MOD, 'hooks', 'earth.shader.ts');
const START = '// @generated start', END = '// @generated end';
const block = [
  START,
  '// written by tools/build-earth-data.mjs: do not edit by hand',
  `const GLYPH = table([${['[0,0]', ...ramp.map(g => `[${g.lo},${g.hi}]`)].join(',')}], 'int')   // ${ramp.map(g => g.c).join('')}`,
  `const LEVELS = ${ramp.length}`,
  `const STAR_DOT = ${starOf('.')}`,
  `const STAR_PLUS = ${starOf('+')}`,
  `const MAP_X = ${MAP.x}, MAP_Y = ${MAP.y}, MAP_W = ${MAP.w}, MAP_H = ${MAP.h}   // the index map's box (y down)`,
  `const PALETTE = table([${Array.from({ length: 16 }, (_, i) => i >= 1 && i <= K ? '[' + centers[i - 1].map(v => Math.round(v * 255)).join(',') + ']' : '[0,0,0]').join(',')}], 'int')   // land colours by index`,
  `const CITY_DIM_INDEX = ${CITY_DIM_INDEX}, CITY_BRIGHT_INDEX = ${CITY_BRIGHT_INDEX}`,
  `const MAP_COLS = ${COLS}, MAP_ROWS = ${ROWS}`,
  END,
].join('\n');
const src = fs.readFileSync(shaderPath, 'utf8');
const a = src.indexOf(START), b = src.indexOf(END);
if (a < 0 || b < 0) throw new Error('earth.shader.ts has no @generated markers');
fs.writeFileSync(shaderPath, src.slice(0, a) + block + src.slice(b + END.length));
fs.writeFileSync(path.join(MOD, 'hooks', 'scene.ts'),
  '// written by tools/build-earth-data.mjs: the faint world map the shader reads, and the still ASCII globe\n'
  + `export const SCENE = ${JSON.stringify(svg)}\n`);
fs.writeFileSync(path.join(HERE, 'scene-preview.svg'), svg);
console.log('wrote hooks/earth.shader.ts, hooks/scene.ts, tools/scene-preview.svg');
