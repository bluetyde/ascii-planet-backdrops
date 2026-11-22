import type { Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { SCENE } from './scene'

// Night sky colours to sit around an ASCII Earth: navy-black surfaces, the sea's blue as the accent.
const { theme, problems } = makeColors({
  label: 'ASCII Earth',
  only: 'dark',
  roles: { accent: '#4f8fe0', danger: '#e0604f', success: '#5aa23f', warning: '#e0a23f', pro: '#a07ce0' },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#05070d',
        'surface-1': '#0b1020',
        'surface-2': '#111829',
        'surface-3': '#172033',
        'text-primary': '#e6edf2',
        'text-secondary': '#b4bfcc',
        'text-muted': '#8f9bab',
      },
    },
  },
})

const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: 'ascii-earth', glass: { blur: 6, tint: '#05070d', opacity: 0.55 } },
}

type Sun = { sunCos: number; sunSin: number; sunLat: number }

// The point on Earth with the sun overhead, from the low-precision solar formulas (good to about a degree).
function subsolar(ms: number): Sun {
  const rad = Math.PI / 180
  const d = ms / 86400000 - 10957.5                       // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * rad              // mean anomaly
  const q = 280.459 + 0.98564736 * d                      // mean longitude, degrees
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad
  const e = (23.439 - 0.00000036 * d) * rad
  const dec = Math.asin(Math.sin(e) * Math.sin(L))
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad
  const gmst = 18.697374558 + 24.06570982441908 * d       // hours
  const lon = (ra - gmst * 15) * rad
  return { sunCos: Math.cos(lon), sunSin: Math.sin(lon), sunLat: dec / rad }
}

let sun: Sun = subsolar(Date.now())

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    sun = subsolar(await $.clock.now())

    try {
      const set = await $.theme.set(LOOK)

      if (!set.isDrawn) {
        $.ui.status(set.reason)
      }
    } catch (error) {
      $.ui.log(String(error))
    }

    // the sun moves half a degree in two minutes: send the new point that often, and the shader eases to it
    $.clock.every(120000, async () => {
      sun = subsolar(await $.clock.now())
      $.ui.invalidate('ui.render')
    })

    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }
    if (e.props.scene !== 'ascii-earth') {
      return next(e)
    }
    const { Shader, Svg } = $.ui.resolve(e)

    return (
      <Shader module="./earth.shader.ts" values={sun}>
        <Svg source={SCENE} alt="Earth drawn in ASCII characters, slowly turning, with the night side lit by cities" isInteractive />
      </Shader>
    )
  })
}
