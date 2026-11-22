// Earth in ASCII glyphs: a globe that turns once every TURN seconds, lit by the real sun, on a field of still stars.
//
// Three passes:
//   GLYPHS  once: the glyph bitmaps (5 x 7 each, side by side) unpacked from the GLYPH table into a small texture.
//   CELLS   every frame: one texel per character cell, its colour (rgb) and glyph (a). The globe's maths runs here,
//           once a cell, not once a pixel. Its colours come from the faint world map the Svg draws (`scene`).
//   picture every pixel: two texture reads, the cell and the glyph's dot.
// tools/build-earth-data.mjs writes the block between the @generated markers.
import {
  shader, table, buffer, picture, scene, values, vec2, vec3, vec4, int, signed,
  floor, sqrt, sin, cos, atan, abs, max, min, mix, clamp, smoothstep, dot, pow, time, size, composer, PI,
} from 'claude-code/shader'
import type { Buffer } from 'claude-code/shader'

// the subsolar point, which the hook works out from the clock every few minutes: its longitude as a cosine and a sine
// (so a step across 180 degrees eases the short way), its latitude in degrees
const v = values({ sunCos: [-1, 1], sunSin: [-1, 1], sunLat: [-24, 24] })

// @generated start
// written by tools/build-earth-data.mjs: do not edit by hand
const GLYPH = table([[0,0],[134217728,0],[-2013265920,0],[458752,0],[-2009067520,0],[9078784,0],[139432064,0],[32537600,0],[156718208,0],[1914839667,6],[524752836,1],[-1096471574,2],[-2082802130,7]], 'int')   // .,-;~+=*%$#@
const LEVELS = 12
const STAR_DOT = 1
const STAR_PLUS = 6
const MAP_X = 0.015, MAP_Y = 0.03, MAP_W = 0.3, MAP_H = 0.24, MAP_ALPHA = 0.2   // the faint map's box (y down)
const MAP_COLS = 360, MAP_ROWS = 180
// @generated end

const TURN = 240     // seconds for one turn of the globe
const TILT = 0.3     // radians the north pole leans toward the viewer
const LON0 = -30     // the longitude facing the viewer at the start

const SPACE = vec3(0.02, 0.027, 0.051)
const SEA_DAY = vec3(0.16, 0.33, 0.6)
const SEA_NIGHT = vec3(0.07, 0.1, 0.2)
const GLINT = vec3(0.85, 0.93, 1)
const CITY_DIM = vec3(1, 0.55, 0.16)
const CITY_BRIGHT = vec3(1, 0.86, 0.55)
const URBAN = vec3(0.58, 0.52, 0.42)
const RIM = vec3(0.31, 0.561, 0.878)
const STAR = vec3(0.541, 0.576, 0.651)

// a character cell is 6 x 9 dots of 1.5 points, fixed in points: a buffer's own `px` is its texel, not the screen's
// pixel, so both passes size cells in points to agree (each pixel picks its own dot, so cells leave no seams)
const DOT = 1.5
const CELL = vec2(6 * DOT, 9 * DOT)

const GLYPHS: Buffer = buffer({ size: [5 * (LEVELS + 1), 7], filter: 'nearest', once: true }, p => {
  const g = floor(p.cell.x / 5)
  const i = int((p.cell.x - g * 5) + p.cell.y * 5)
  const bits = GLYPH.at(g)
  const on = (i < 32 ? bits[0] >>> i : bits[1] >>> (i - 32)) & 1
  return vec4(signed(on), 0, 0, 1)
})

// the faint map in the Svg, decoded back to full colour: the scene shows it at MAP_ALPHA over SPACE
function mapColor(lat: number, lon: number): vec3 {
  const fx = clamp(lon / (2 * PI) + 0.5, 0.5 / MAP_COLS, 1 - 0.5 / MAP_COLS)
  const fy = clamp(0.5 - lat / PI, 0.5 / MAP_ROWS, 1 - 0.5 / MAP_ROWS)
  const s = scene.sample(vec2(MAP_X + fx * MAP_W, 1 - (MAP_Y + fy * MAP_H)))
  return vec3(clamp((vec3(s.rgb) - SPACE * (1 - MAP_ALPHA)) / MAP_ALPHA, 0, 1))
}

function level(b: number): number {
  return 1 + clamp(floor(b * LEVELS), 0, LEVELS - 1)
}

function starHash(x: number, y: number): number {
  let h = int(x) * 374761393 ^ int(y) * 668265263
  h = int((h ^ (h >>> 13)) * 1274126177)
  return signed((h ^ (h >>> 16)) & 65535) / 65536
}

// one texel a character cell: cells are 9 points wide, so a texel every 6 points leaves texels to spare at the right and
// top, which nothing reads
const CELLS: Buffer = buffer({ scale: 1 / 6, filter: 'nearest' }, p => {
  const at = vec2((p.cell + 0.5) * CELL)

  // the globe right of the middle (on top in portrait), clear of the message box
  const wide = size.x > size.y * 1.1
  const R = wide ? min(size.y * 0.4, size.x * 0.27) : min(size.x * 0.42, size.y * 0.24)
  const cx = wide ? size.x * 0.7 : size.x * 0.5
  const cy = max(wide ? size.y * 0.55 : size.y * 0.7, composer.w * size.y + R + 16)
  const q = vec2((at - vec2(cx, cy)) / R)
  const r2 = dot(q, q)

  let g = 0
  let color = vec3(SPACE)

  if (r2 < 1) {
    const z = sqrt(1 - r2)
    const y1 = q.y * cos(TILT) + z * sin(TILT)
    const z1 = z * cos(TILT) - q.y * sin(TILT)
    const spin = (-90 - LON0) * PI / 180 + time * 2 * PI / TURN
    const nx = q.x * cos(spin) - z1 * sin(spin)
    const nz = q.x * sin(spin) + z1 * cos(spin)
    const lat = atan(y1, sqrt(nx * nx + nz * nz))
    const lon = atan(-nz, nx)
    const c = mapColor(lat, lon)

    // what the map's colour is: a city mark (red full, no blue), the sea (blue over red and green), or land
    const city = c.r > 0.85 && c.b < 0.15
    const sea = !city && c.b > c.r + 0.08 && c.b > c.g
    const bright = city && c.g > 0.68

    // the sun, from the subsolar point (a point at latitude a, longitude o is (cos a cos o, sin a, -cos a sin o))
    const sLat = v.sunLat * PI / 180
    const ring = max(0.001, sqrt(v.sunCos * v.sunCos + v.sunSin * v.sunSin))
    const sx = cos(sLat) * v.sunCos / ring, sy = sin(sLat), sz = -cos(sLat) * v.sunSin / ring
    const l = nx * sx + y1 * sy + nz * sz
    const day = smoothstep(-0.06, 0.3, l)
    const night = smoothstep(0.04, -0.12, l)
    const limb = 0.62 + 0.38 * z

    if (sea) {
      // a soft glint where the sun is nearly overhead
      const shine = pow(max(0, l), 80) * z
      const b = (0.06 + 0.2 * day) * limb + 0.3 * shine * day
      g = night > 0.9 ? (starHash(p.cell.x, p.cell.y) < 0.35 ? 1 : 0) : level(b)
      color = mix(mix(SEA_NIGHT, SEA_DAY, day), GLINT, clamp(shine * 1.5, 0, 1) * day)
    } else {
      const land = city ? URBAN : c
      const peak = max(land.r, max(land.g, land.b))
      const hue = vec3(land / max(peak, 0.04))
      const lum = dot(land, vec3(0.3, 0.59, 0.11))
      const dayB = (0.2 + 0.8 * day) * (0.45 + 0.55 * sqrt(lum)) * limb
      if (city && night > 0.3) {
        g = level((bright ? 0.75 : 0.45) * night + 0.08)
        color = bright ? CITY_BRIGHT : CITY_DIM
      } else if (night > 0.6) {
        // night land: dim and greyed, so it stands apart from the near-empty night sea
        g = level(0.16 * limb)
        color = vec3(mix(hue, vec3(0.6), 0.55) * 0.42)
      } else {
        // the map's own colour, brightened, with a little of its pure hue
        const tone = vec3(mix(min(land * 1.7, vec3(1)), hue, 0.3))
        g = level(min(0.72, dayB))
        color = vec3(tone * (0.55 + 0.45 * day))
      }
    }
  } else if (r2 < 1.13) {
    g = 1 + min(1, floor((1.13 - r2) * 12))
    color = RIM
  } else {
    const h = starHash(p.cell.x, p.cell.y)
    if (h < 0.006) {
      g = STAR_DOT
      color = STAR
    } else if (h < 0.008) {
      g = STAR_PLUS
      color = STAR
    }
  }
  return vec4(color, g / 15)
})

const sky = picture(p => {
  const cell = vec2(floor(p.point / CELL))
  const dots = vec2(floor((p.point - cell * CELL) / DOT))
  const m = CELLS.at(cell)
  const g = floor(m.a * 15 + 0.5)
  // the glyph's 5 x 7 bitmap, row 0 at the top, in the cell's dots 0-4 across and 1-7 down (dots run up from the bottom)
  const gx = dots.x
  const gy = 7 - dots.y
  const inside = g > 0.5 && gx < 4.5 && gy > -0.5 && gy < 6.5
  const on = inside ? GLYPHS.at(vec2(g * 5 + gx, gy)).r : 0
  return on > 0.5 ? vec4(vec3(m.rgb), 1) : vec4(SPACE, 1)
})

export default shader({ fps: 30, passes: [GLYPHS, CELLS, sky] })
