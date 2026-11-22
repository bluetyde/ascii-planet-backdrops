// Where the sun is, for each kind of body: copied unchanged into every mod by tools/build.mjs.

export type Sun = { sunX: number; sunY: number; sunZ: number }
export type SunMode = 'earth' | 'moon' | 'fixed'

const rad = Math.PI / 180

// Earth: the point with the sun overhead, as a direction in Earth's own frame (the low-precision solar formulas, good to
// about a degree). A point at latitude a, longitude o is (cos a cos o, sin a, -cos a sin o).
function earthSun(ms: number): Sun {
  const d = ms / 86400000 - 10957.5                       // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * rad              // mean anomaly
  const q = 280.459 + 0.98564736 * d                      // mean longitude, degrees
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad
  const e = (23.439 - 0.00000036 * d) * rad
  const dec = Math.asin(Math.sin(e) * Math.sin(L))
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad
  const gmst = 18.697374558 + 24.06570982441908 * d       // hours
  const lon = (ra - gmst * 15) * rad
  return { sunX: Math.cos(dec) * Math.cos(lon), sunY: Math.sin(dec), sunZ: -Math.cos(dec) * Math.sin(lon) }
}

// The Moon: today's phase, as the sun's direction seen from Earth (x right, y up, z toward the viewer). New moon puts the
// sun behind the Moon, full moon behind the viewer; while it waxes the lit side is on the right.
function moonSun(ms: number): Sun {
  const days = ms / 86400000 + 2440587.5 - 2451550.26     // since the new moon of 2000-01-06 18:14 UTC
  const age = ((days % 29.530588853) + 29.530588853) % 29.530588853
  const angle = age / 29.530588853 * 2 * Math.PI
  return { sunX: Math.sin(angle), sunY: 0, sunZ: -Math.cos(angle) }
}

// Every other body: a sun up and to the left, a little in front, so the terminator shows on the right.
const FIXED: Sun = (() => { const x = -0.55, y = 0.35, z = 0.76, l = Math.hypot(x, y, z); return { sunX: x / l, sunY: y / l, sunZ: z / l } })()

export function sunFor(mode: SunMode, ms: number): Sun {
  return mode === 'earth' ? earthSun(ms) : mode === 'moon' ? moonSun(ms) : FIXED
}
