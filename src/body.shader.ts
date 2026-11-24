// A body of the Solar System in ASCII glyphs, turning slowly behind the conversation.
//
// This is the template tools/build.mjs turns into each mod's hooks/<body>.shader.ts: it keeps the lines between
// `// #if FLAG` and `// #endif` where the body has FLAG, drops them where it has not, and fills the @generated block.
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

// #if MAP
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
// #endif

// #if NOISE
function hash3(x: number, y: number, z: number): number {
  let h = int(x) * 374761393 ^ int(y) * 668265263 ^ int(z) * 1440662683
  h = int((h ^ (h >>> 13)) * 1274126177)
  return signed((h ^ (h >>> 16)) & 65535) / 65536
}

// value noise, 0 to 1, smooth between whole-number lattice points
function noise(px: number, py: number, pz: number): number {
  const ix = floor(px), iy = floor(py), iz = floor(pz)
  const fx = px - ix, fy = py - iy, fz = pz - iz
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz)
  const a = mix(mix(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), ux), mix(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), ux), uy)
  const b = mix(mix(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), ux), mix(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), ux), uy)
  return mix(a, b, uz)
}
// #endif

// #if SATURN
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
// #endif

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
    // #if SPIN
    const spin = (-90 - LON0) * PI / 180 + time * 2 * PI / TURN
    // #endif
    // #if LIBRATE
    const spin = (-90 - LON0) * PI / 180 + 0.12 * sin(time * 2 * PI / 90)
    // #endif
    const nx = q.x * cos(spin) - z1 * sin(spin)
    const nz = q.x * sin(spin) + z1 * cos(spin)
    const lat = atan(y1, sqrt(nx * nx + nz * nz))
    const lon = atan(-nz, nx)
    const limb = 0.62 + 0.38 * z

    // #if BODYSUN
    const l = nx * sx + y1 * sy + nz * sz
    // #endif
    // #if VIEWSUN
    const l = q.x * sx + q.y * sy + z * sz
    // #endif
    const day = smoothstep(-0.06, 0.3, l)
    const night = smoothstep(0.04, -0.12, l)

    // #if EARTH
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
    // #endif

    // #if ROCK
    // #if JUPITER
    // the cloud bands drift at different speeds by latitude
    const lonAt = lon + time * DRIFT * sin(lat * 9)
    // #endif
    // #if PLAIN
    const lonAt = lon
    // #endif
    const c = paletteColor(mapIndex(lat, lonAt))
    const peak = max(c.r, max(c.g, c.b))
    const hue = vec3(c / max(peak, 0.04))
    // brightness stretched over the body's own range, so dark maria and pale highlands get different glyphs
    const lumN = clamp((dot(c, vec3(0.3, 0.59, 0.11)) - LUM_LO) / (LUM_HI - LUM_LO), 0, 1)
    const tone = vec3(mix(min(c * BRIGHTEN, vec3(1)), hue, 0.25))
    if (night > 0.6) {
      // the night side, faintly lit (earthshine on the Moon)
      g = level(NIGHT_GLOW * limb * (0.5 + 0.5 * lumN), dth)
      color = vec3(mix(tone, vec3(0.55, 0.6, 0.7), 0.5) * 0.4)
    } else {
      g = level(min(0.8, (0.12 + 0.88 * day) * (0.18 + 0.82 * lumN) * limb), dth)
      color = vec3(tone * (0.5 + 0.5 * day))
    }
    // #endif

    // #if SATURN
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
    g = night > 0.7 ? level(0.05 * limb, dth) : level(min(0.75, (0.15 + 0.75 * lit) * limb), dth)
    color = vec3(shade * (0.45 + 0.55 * lit))
    // #endif

    // #if SUN
    // granulation that changes slowly, sunspots in the active belts, the disc darker toward its edge
    const gran = noise(nx * 22 + time * 0.03, y1 * 22, nz * 22)
    const spotN = noise(nx * 6 + 11, y1 * 6, nz * 6 + time * 0.004)
    const belt = smoothstep(0.65, 0.3, abs(lat)) * smoothstep(0.05, 0.15, abs(lat))
    const spot = smoothstep(0.8, 0.85, spotN) * belt
    const ld = pow(z, 0.55)
    g = level(min(0.95, ld * (0.62 + 0.38 * gran) * (1 - 0.75 * spot)), dth)
    color = vec3(mix(SUN_LIMB, SUN_CORE, ld) * (1 - 0.45 * spot))
    // #endif
  } else {
    const rr = sqrt(r2)
    // #if RIM
    if (rr < RIM_OUT) {
      g = 1 + min(1, floor((RIM_OUT - rr) * 12))
      color = RIM
    }
    // #endif
    // #if SUN
    // the corona: faint streamers that turn very slowly
    if (rr < 1.55) {
      const ang = atan(q.y, q.x)
      const streak = noise(cos(ang) * 3 + 5, sin(ang) * 3 + 5, time * 0.005)
      const fall = pow(1 - (rr - 1) / 0.55, 2.2)
      g = rr < 1.04 ? level(0.5, dth) : level(min(0.5, fall * (0.25 + 0.6 * streak)), dth)
      color = vec3(mix(SUN_LIMB, vec3(1, 0.85, 0.6), 0.3) * (0.55 + 0.45 * fall))
    }
    // #endif
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

  // #if SATURN
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
    g = level(min(0.7, 0.08 + 0.62 * b), dth)
    color = vec3(RING_COLOR * (0.45 + 0.55 * b))
  }
  // #endif

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
