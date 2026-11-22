// A body for each day of the week, switching at local midnight: the Sun on Sunday, the Moon on Monday, Mars on Tuesday
// (dies Martis), Mercury on Wednesday, Jupiter on Thursday, Earth on Friday, Saturn on Saturday.
// /world <body> shows another body until the session ends; /world on its own goes back to the day's.
// tools/build.mjs writes this file into the week mod and fills the @generated block.
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { sunFor, type Sun } from './sun'

// @generated start
// @generated end

type Body = (typeof WEEK)[number]

const themes = new Map<Body, ThemeSetArgs>()
for (const body of WEEK) {
  const spec = BODIES[body]
  themes.set(body, {
    colors: makeColors(spec.look).theme,
    backdrop: { scene: spec.scene, glass: { blur: 6, tint: spec.glass, opacity: 0.55 } },
  })
}

let chosen: Body | undefined
let shown: Body = WEEK[new Date().getDay()]!
let sun: Sun = sunFor(BODIES[shown].sun, Date.now())

function today(ms: number): Body {
  return WEEK[new Date(ms).getDay()]!
}

// shows a body: its look, and the sun where it is now
async function show($: EngineInterface, body: Body) {
  const ms = await $.clock.now()
  shown = body
  sun = sunFor(BODIES[body].sun, ms)
  try {
    const set = await $.theme.set(themes.get(body)!)
    if (!set.isDrawn) {
      $.ui.status(set.reason)
    }
  } catch (error) {
    $.ui.log(String(error))
  }
  $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'world', description: 'Show another body: /world sun|moon|mars|mercury|jupiter|earth|saturn, or /world for today\'s' })
    await show($, today(await $.clock.now()))

    // each minute: a new day brings its body (unless /world chose one); the sun moves on
    $.clock.every(60000, async () => {
      const ms = await $.clock.now()
      const body = chosen ?? today(ms)
      if (body !== shown) {
        await show($, body)
      } else if (BODIES[body].sun !== 'fixed') {
        sun = sunFor(BODIES[body].sun, ms)
        $.ui.invalidate('ui.render')
      }
    })

    return next(e)
  })

  on('command.run', { command: 'world' }, async ($, e) => {
    const asked = e.args.trim().toLowerCase()
    if (asked === '') {
      chosen = undefined
      const body = today(await $.clock.now())
      await show($, body)
      return { text: `Back to today's body: ${BODIES[body].label}.` }
    }
    const body = WEEK.find(one => one === asked)
    if (body === undefined) {
      return { text: `No body called "${asked}". Try one of: ${WEEK.join(', ')}.` }
    }
    chosen = body
    await show($, body)
    return { text: `Showing ${BODIES[body].label} until this session ends (/world on its own goes back to today's).` }
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }
    const { Shader, Svg } = $.ui.resolve(e)
    // each branch names its shader file as a literal, as a Shader element must
    // @generated-render start
    // @generated-render end
    return next(e)
  })
}
