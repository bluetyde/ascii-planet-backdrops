// Earth's backdrop, every day. Written by tools/build.mjs from src/register.tsx: do not edit by hand.
import type { Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { SCENE } from './scene'
import { sunFor, type Sun, type SunMode } from './sun'

// @generated start
const SCENE_ID = 'ascii-earth'
const ALT = "Earth drawn in ASCII characters, slowly turning, with the night side lit by cities"
const SUN_MODE = 'earth' as SunMode
const GLASS = '#05070d'
const LOOK: Parameters<typeof makeColors>[0] = {"label":"ASCII Earth","only":"dark","roles":{"accent":"#4f8fe0","danger":"#e0604f","success":"#5aa23f","warning":"#e0a23f","pro":"#a07ce0"},"dark":{"gray":{"anchors":{"surface-0":"#05070d","surface-1":"#0b0d13","surface-2":"#101218","surface-3":"#17191f","text-primary":"#ece8e2","text-secondary":"#bfb8ae","text-muted":"#9a9389"}}}}
// @generated end

const { theme, problems } = makeColors(LOOK)

const THEME: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: SCENE_ID, glass: { blur: 6, tint: GLASS, opacity: 0.55 } },
}

let sun: Sun = sunFor(SUN_MODE, Date.now())

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    sun = sunFor(SUN_MODE, await $.clock.now())

    try {
      const set = await $.theme.set(THEME)

      if (!set.isDrawn) {
        $.ui.status(set.reason)
      }
    } catch (error) {
      $.ui.log(String(error))
    }

    // the sun moves half a degree in two minutes on Earth, and the Moon's phase more slowly: send the new direction that
    // often, and the shader eases to it
    if (SUN_MODE !== 'fixed') {
      $.clock.every(120000, async () => {
        sun = sunFor(SUN_MODE, await $.clock.now())
        $.ui.invalidate('ui.render')
      })
    }

    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }
    if (e.props.scene !== SCENE_ID) {
      return next(e)
    }
    const { Shader, Svg } = $.ui.resolve(e)

    return (
      <Shader module="./earth.shader.ts" values={sun}>
        <Svg source={SCENE} alt={ALT} isInteractive />
      </Shader>
    )
  })
}
