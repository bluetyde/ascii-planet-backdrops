// A body of the Solar System in ASCII glyphs, turning slowly behind the conversation.
//
//
// Three passes:
//   GLYPHS  once: the glyph bitmaps (5 x 7 each, side by side) unpacked from the GLYPH table.
//   CELLS   every frame: one texel per character cell, its colour (rgb) and glyph (a). The body's maths runs here, once
//           a cell. A body with a map reads it from the Svg (`scene`), where it is drawn in index colours a step off black.
//   picture every pixel: two texture reads, the cell and the glyph's dot.
import {
  shader, table, buffer, picture, scene, values, vec2, vec3, vec4, int, signed,
  floor, fract, sqrt, sin, cos, atan, abs, max, min, mix, clamp, smoothstep, dot, pow, mod, time, size, composer, PI,
} from 'claude-code/shader'
import type { Buffer } from 'claude-code/shader'

// the sun's direction: on Earth in Earth's own frame (from the real subsolar point), elsewhere in view space
// (x right, y up, z toward the viewer); the hook sends it, and eases it as it changes
const v = values({ sunX: [-1, 1], sunY: [-1, 1], sunZ: [-1, 1] })

// @generated start
// written by tools/build.mjs for Earth: do not edit by hand
const GLYPH = table([[0,0],[134217728,0],[-2013265920,0],[458752,0],[-2009067520,0],[9078784,0],[139432064,0],[32537600,0],[156718208,0],[1914839667,6],[524752836,1],[-1096471574,2],[-2082802130,7],[138547332,1],[1143087376,0],[276957249,4],[-1073741824,7]], 'int')   // .,-;~+=*%$#@ then the outline's | / \ _
const GLYPH_COUNT = 17
const OUT_V = 13, OUT_S = 14, OUT_B = 15, OUT_U = 16, OUT_D = 3   // the outline's | / \ _ -
const LEVELS = 12, STAR_DOT = 1, STAR_PLUS = 6
const TURN = 240
const TILT = 0.3
const LON0 = -30
const BODY_SCALE = 1
const RIM_OUT = 1.13
const RIM = vec3(0.3098, 0.5608, 0.8784)
const SEA_DAY = vec3(0.1608, 0.3294, 0.5608)
const SEA_NIGHT = vec3(0.0706, 0.102, 0.2)
const GLINT = vec3(0.851, 0.9294, 1)
const CITY_DIM = vec3(1, 0.549, 0.1608)
const CITY_BRIGHT = vec3(1, 0.8588, 0.549)
const URBAN = vec3(0.5804, 0.5216, 0.4196)
const SPACE = vec3(0.0196, 0.0275, 0.051)
const STAR = vec3(0.5412, 0.5765, 0.651)
const MAP_X = 0.015, MAP_Y = 0.03, MAP_W = 0.3, MAP_H = 0.24, MAP_COLS = 360, MAP_ROWS = 180   // the index map's box (y down)
const PALETTE = table([[0,0,0],[40,58,14],[55,71,20],[71,81,32],[93,92,50],[127,113,75],[172,146,103],[153,153,150],[189,183,173],[232,211,174],[247,247,242],[255,140,41],[255,219,140],[0,0,0],[0,0,0],[0,0,0]], 'int')
const CITY_DIM_INDEX = 11
const CITY_BRIGHT_INDEX = 12
// @generated end

// a character cell is 6 x 9 dots of 1.5 points, fixed in points: a buffer's own `px` is its texel, not the screen's
// pixel, so both passes size cells in points to agree (each pixel picks its own dot, so cells leave no seams)
const DOT = 1.5
const CELL = vec2(6 * DOT, 9 * DOT)

const GLYPHS: Buffer = buffer({ size: [5 * GLYPH_COUNT, 7], filter: 'nearest', once: true }, p => {
  const g = floor(p.cell.x / 5)
  const i = int((p.cell.x - g * 5) + p.cell.y * 5)
  const bits = GLYPH.at(g)
  const on = (i < 32 ? bits[0] >>> i : bits[1] >>> (i - 32)) & 1
  return vec4(signed(on), 0, 0, 1)
})

// the step of the ramp for a brightness, nudged by this cell's dither (d) so smooth gradients mix two steps instead of banding
function level(b: number, d: number): number {
  return 1 + clamp(floor((b + d) * LEVELS), 0, LEVELS - 1)
}

// the 4 x 4 ordered-dither pattern (Bayer), 0 to 15
const BAYER = table([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], 'int')

function starHash(x: number, y: number): number {
  let h = int(x) * 374761393 ^ int(y) * 668265263
  h = int((h ^ (h >>> 13)) * 1274126177)
  return signed((h ^ (h >>> 16)) & 65535) / 65536
}

// the index the Svg's map holds at a latitude and longitude (radians), read at the middle of its map cell so neighbours
// don't blend: red 5 + 2 (i & 3), green 7 + 2 (i >> 2), of 255
function mapIndex(lat: number, lon: number): number {
  const fx = (floor(fract(lon / (2 * PI) + 0.5) * MAP_COLS) + 0.5) / MAP_COLS
  const fy = (clamp(floor((0.5 - lat / PI) * MAP_ROWS), 0, MAP_ROWS - 1) + 0.5) / MAP_ROWS
  const s = scene.sample(vec2(MAP_X + fx * MAP_W, 1 - (MAP_Y + fy * MAP_H)))
  const lo = clamp(floor((s.r * 255 - 5) / 2 + 0.5), 0, 3)
  const hi = clamp(floor((s.g * 255 - 7) / 2 + 0.5), 0, 3)
  return lo + 4 * hi
}

function paletteColor(i: number): vec3 {
  const c = PALETTE.at(i)
  return vec3(signed(c[0]) / 255, signed(c[1]) / 255, signed(c[2]) / 255)
}



const CELLS: Buffer = buffer({ scale: 1 / 6, filter: 'nearest' }, p => {
  const at = vec2((p.cell + 0.5) * CELL)
  // this cell's dither: up to half a step either way, fixed to the cell so it never flickers
  const dth = ((signed(BAYER.at(mod(p.cell.y, 4) * 4 + mod(p.cell.x, 4))) + 0.5) / 16 - 0.5) / LEVELS

  // the body right of the middle (on top in portrait), clear of the message box
  const wide = size.x > size.y * 1.1
  const R0 = wide ? min(size.y * 0.4, size.x * 0.27) : min(size.x * 0.42, size.y * 0.24)
  const R = R0 * BODY_SCALE
  const cx = wide ? size.x * 0.7 : size.x * 0.5
  const cy = max(wide ? size.y * 0.55 : size.y * 0.7, composer.w * size.y + R0 + 16)
  const q = vec2((at - vec2(cx, cy)) / R)
  const r2 = dot(q, q)

  const sl = max(0.001, sqrt(v.sunX * v.sunX + v.sunY * v.sunY + v.sunZ * v.sunZ))
  const sx = v.sunX / sl, sy = v.sunY / sl, sz = v.sunZ / sl

  let g = 0
  let color = vec3(SPACE)

  if (r2 < 1) {
    const z = sqrt(1 - r2)
    // tilt the pole toward the viewer, then turn the body about its pole
    const y1 = q.y * cos(TILT) + z * sin(TILT)
    const z1 = z * cos(TILT) - q.y * sin(TILT)
    const spin = (-90 - LON0) * PI / 180 + time * 2 * PI / TURN
    const nx = q.x * cos(spin) - z1 * sin(spin)
    const nz = q.x * sin(spin) + z1 * cos(spin)
    const lat = atan(y1, sqrt(nx * nx + nz * nz))
    const lon = atan(-nz, nx)
    const limb = 0.62 + 0.38 * z

    const l = nx * sx + y1 * sy + nz * sz
    const day = smoothstep(-0.06, 0.3, l)
    const night = smoothstep(0.04, -0.12, l)

    const idx = mapIndex(lat, lon)
    const city = idx > CITY_DIM_INDEX - 0.5
    const sea = idx < 0.5
    const bright = idx > CITY_BRIGHT_INDEX - 0.5
    const c = paletteColor(idx)
    if (sea) {
      // a soft glint where the sun is nearly overhead
      const shine = pow(max(0, l), 80) * z
      const b = (0.06 + 0.2 * day) * limb + 0.3 * shine * day
      g = night > 0.9 ? (starHash(p.cell.x, p.cell.y) < 0.35 ? 1 : 0) : level(b, dth)
      color = mix(mix(SEA_NIGHT, SEA_DAY, day), GLINT, clamp(shine * 1.5, 0, 1) * day)
    } else {
      const land = city ? URBAN : c
      const peak = max(land.r, max(land.g, land.b))
      const hue = vec3(land / max(peak, 0.04))
      const lum = dot(land, vec3(0.3, 0.59, 0.11))
      const dayB = (0.2 + 0.8 * day) * (0.45 + 0.55 * sqrt(lum)) * limb
      if (city && night > 0.3) {
        g = level((bright ? 0.75 : 0.45) * night + 0.08, dth)
        color = bright ? CITY_BRIGHT : CITY_DIM
      } else if (night > 0.6) {
        // night land: dim and greyed, so it stands apart from the near-empty night sea
        g = level(0.16 * limb, dth)
        color = vec3(mix(hue, vec3(0.6), 0.55) * 0.42)
      } else {
        // the map's own colour, brightened, with a little of its pure hue
        const tone = vec3(mix(min(land * 1.7, vec3(1)), hue, 0.3))
        g = level(min(0.72, dayB), dth)
        color = vec3(tone * (0.55 + 0.45 * day))
      }
    }



  } else {
    const rr = sqrt(r2)
    if (rr < RIM_OUT) {
      g = 1 + min(1, floor((RIM_OUT - rr) * 12))
      color = RIM
    }
    if (g < 0.5) {
      const h = starHash(p.cell.x, p.cell.y)
      if (h < 0.006) {
        g = STAR_DOT
        color = STAR
      } else if (h < 0.008) {
        g = STAR_PLUS
        color = STAR
      }
    }
  }


  // the disc's outline, from its geometry: the character follows the circle's direction at this angle
  if (r2 < 1 && sqrt(r2) > 1 - CELL.x * 1.15 / R) {
    const a = atan(q.y, q.x) * 180 / PI
    const n90 = abs(mod(a - 90 + 540, 360) - 180) <= 22.5
    const nm90 = abs(mod(a + 90 + 540, 360) - 180) <= 22.5
    const n0 = abs(mod(a + 540, 360) - 180) <= 22.5 || abs(mod(a - 180 + 540, 360) - 180) <= 22.5
    const n45 = abs(mod(a - 45 + 540, 360) - 180) <= 22.5 || abs(mod(a + 135 + 540, 360) - 180) <= 22.5
    g = n90 ? OUT_D : nm90 ? OUT_U : n0 ? OUT_V : n45 ? OUT_B : OUT_S
    color = vec3(min(color * 1.2 + 0.08, vec3(1)))
  }

  return vec4(color, g / 31)
})

const sky = picture(p => {
  const cell = vec2(floor(p.point / CELL))
  const dots = vec2(floor((p.point - cell * CELL) / DOT))
  const m = CELLS.at(cell)
  const g = floor(m.a * 31 + 0.5)
  // the glyph's 5 x 7 bitmap, row 0 at the top, in the cell's dots 0-4 across and 1-7 down (dots run up from the bottom)
  const gx = dots.x
  const gy = 7 - dots.y
  const inside = g > 0.5 && gx < 4.5 && gy > -0.5 && gy < 6.5
  const on = inside ? GLYPHS.at(vec2(g * 5 + gx, gy)).r : 0
  return on > 0.5 ? vec4(vec3(m.rgb), 1) : vec4(SPACE, 1)
})

export default shader({ fps: 30, passes: [GLYPHS, CELLS, sky] })
