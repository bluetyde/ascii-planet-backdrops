// One body's backdrop, every day. tools/build.mjs writes this file into each body's mod and fills the @generated block.
import type { Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { SCENE } from './scene'
import { sunFor, type Sun, type SunMode } from './sun'

// @generated start
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
      <Shader module="./SHADER_FILE" values={sun}>
        <Svg source={SCENE} alt={ALT} isInteractive />
      </Shader>
    )
  })
}
