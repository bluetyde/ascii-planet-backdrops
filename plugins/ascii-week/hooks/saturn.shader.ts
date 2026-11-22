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
  floor, fract, sqrt, sin, cos, atan, abs, max, min, mix, clamp, smoothstep, dot, pow, time, size, composer, PI,
} from 'claude-code/shader'
import type { Buffer } from 'claude-code/shader'

// the sun's direction: on Earth in Earth's own frame (from the real subsolar point), elsewhere in view space
// (x right, y up, z toward the viewer); the hook sends it, and eases it as it changes
const v = values({ sunX: [-1, 1], sunY: [-1, 1], sunZ: [-1, 1] })

// @generated start
// written by tools/build.mjs for Saturn: do not edit by hand
const GLYPH = table([[0,0],[134217728,0],[-2013265920,0],[458752,0],[-2009067520,0],[9078784,0],[139432064,0],[32537600,0],[156718208,0],[1914839667,6],[524752836,1],[-1096471574,2],[-2082802130,7]], 'int')   // .,-;~+=*%$#@
const LEVELS = 12, STAR_DOT = 1, STAR_PLUS = 6
const TURN = 200
const TILT = 0.42
const LON0 = 0
const BODY_SCALE = 0.44
const RING_COLOR = vec3(0.851, 0.7804, 0.6196)
const SPACE = vec3(0.0314, 0.0275, 0.0235)
const STAR = vec3(0.5412, 0.5765, 0.651)
const BANDS = table([[138,125,106],[156,140,112],[179,159,124],[201,182,142],[216,196,154],[205,180,135],[226,208,166],[233,217,176],[230,212,168],[217,194,148],[224,205,159],[200,176,131],[214,193,147],[191,167,124],[168,147,111],[143,128,104]], 'int')
// @generated end

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

function level(b: number): number {
  return 1 + clamp(floor(b * LEVELS), 0, LEVELS - 1)
}

function starHash(x: number, y: number): number {
  let h = int(x) * 374761393 ^ int(y) * 668265263
  h = int((h ^ (h >>> 13)) * 1274126177)
  return signed((h ^ (h >>> 16)) & 65535) / 65536
}



// Saturn's cloud bands, from the north pole (row 0) to the south (row 15)
function bandColor(lat: number): vec3 {
  const f = clamp((0.5 - lat / PI) * 16, 0, 15.999)
  const i = floor(f)
  const a = BANDS.at(i), b = BANDS.at(min(i + 1, 15))
  const ca = vec3(signed(a[0]) / 255, signed(a[1]) / 255, signed(a[2]) / 255)
  const cb = vec3(signed(b[0]) / 255, signed(b[1]) / 255, signed(b[2]) / 255)
  return vec3(mix(ca, cb, smoothstep(0.2, 0.8, f - i)))
}

// the rings' brightness at a radius (in planet radii), 0 in the gaps and outside
function ringAt(r: number): number {
  const c = smoothstep(1.24, 1.3, r) * (1 - smoothstep(1.5, 1.53, r)) * 0.35        // C ring, faint
  const b = smoothstep(1.52, 1.56, r) * (1 - smoothstep(1.93, 1.95, r)) * (0.8 + 0.2 * sin(r * 60))   // B ring, bright
  const a = smoothstep(2.02, 2.04, r) * (1 - smoothstep(2.25, 2.27, r)) * 0.6       // A ring, past the Cassini Division
  const encke = 1 - 0.8 * smoothstep(2.21, 2.215, r) * (1 - smoothstep(2.225, 2.23, r))
  return (c + b + a) * encke
}

const CELLS: Buffer = buffer({ scale: 1 / 6, filter: 'nearest' }, p => {
  const at = vec2((p.cell + 0.5) * CELL)

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

    const l = q.x * sx + q.y * sy + z * sz
    const day = smoothstep(-0.06, 0.3, l)
    const night = smoothstep(0.04, -0.12, l)



    const band = bandColor(lat)
    // the hexagon around the north pole
    const hexA = atan(nz, nx) + time * 0.01
    const hexR = cos(PI / 6) / cos(hexA - (PI / 3) * floor(hexA / (PI / 3) + 0.5))
    const polar = PI / 2 - lat
    const hex = smoothstep(0.03, 0, abs(polar - 0.22 * hexR)) * smoothstep(0.9, 1.2, lat)
    // the rings' shadow on the disc: from this point toward the sun, where the ray meets the ring plane
    const ct = cos(TILT), st = sin(TILT)
    const nDot = sy * ct + sz * st
    const t = -(q.y * ct + z * st) / (abs(nDot) > 0.001 ? nDot : 0.001)
    const hx = q.x + t * sx, hy = q.y + t * sy, hz = z + t * sz
    const shadow = t > 0 ? ringAt(sqrt(hx * hx + hy * hy + hz * hz)) : 0
    const lit = day * (1 - 0.75 * min(1, shadow * 1.6))
    const shade = vec3(mix(band, vec3(0.35, 0.3, 0.22), hex * 0.7))
    g = night > 0.7 ? level(0.05 * limb) : level(min(0.75, (0.15 + 0.75 * lit) * limb))
    color = vec3(shade * (0.45 + 0.55 * lit))

  } else {
    const rr = sqrt(r2)
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

  // the rings: where this cell's line of sight meets the ring plane, if that point is in front of the planet
  const ct2 = cos(TILT), st2 = sin(TILT)
  const zr = -q.y * ct2 / st2
  const rr2 = sqrt(q.x * q.x + q.y * q.y + zr * zr)
  const ring = ringAt(rr2)
  const front = r2 >= 1 || zr > sqrt(max(0, 1 - r2))
  if (ring > 0.05 && front) {
    // the planet's shadow on the rings: the ring point, looked at from the sun, falls inside the disc
    const along = q.x * sx + q.y * sy + zr * sz
    const ox = q.x - along * sx, oy = q.y - along * sy, oz = zr - along * sz
    const inShadow = along < 0 && ox * ox + oy * oy + oz * oz < 1
    const b = ring * (inShadow ? 0.15 : 1)
    g = level(min(0.7, 0.08 + 0.62 * b))
    color = vec3(RING_COLOR * (0.45 + 0.55 * b))
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
