// A body for each day of the week, switching at local midnight: the Sun on Sunday, the Moon on Monday, Mars on Tuesday
// (dies Martis), Mercury on Wednesday, Jupiter on Thursday, Earth on Friday, Saturn on Saturday.
// /world <body> shows another body until the session ends; /world on its own goes back to the day's.
// Written by tools/build.mjs from src/week.tsx: do not edit by hand.
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { sunFor, type Sun } from './sun'

// @generated start
import { SCENE as SCENE_SUN } from './sun.scene'
import { SCENE as SCENE_MOON } from './moon.scene'
import { SCENE as SCENE_MARS } from './mars.scene'
import { SCENE as SCENE_MERCURY } from './mercury.scene'
import { SCENE as SCENE_JUPITER } from './jupiter.scene'
import { SCENE as SCENE_EARTH } from './earth.scene'
import { SCENE as SCENE_SATURN } from './saturn.scene'
import type { SunMode } from './sun'

// Sunday first, as Date.getDay counts
const WEEK = ["sun","moon","mars","mercury","jupiter","earth","saturn"] as const
const BODIES = {
  sun: { label: "the Sun", scene: 'ascii-sun', alt: "The Sun drawn in ASCII characters, its surface churning slowly, with a faint corona", sun: 'fixed' as SunMode, glass: '#090504', look: {"label":"ASCII Sun","only":"dark","roles":{"accent":"#e0902f","danger":"#e0604f","success":"#5aa23f","warning":"#e0a23f","pro":"#a07ce0"},"dark":{"gray":{"anchors":{"surface-0":"#090504","surface-1":"#0f0b0a","surface-2":"#14100f","surface-3":"#1b1716","text-primary":"#ece8e2","text-secondary":"#bfb8ae","text-muted":"#9a9389"}}}} as Parameters<typeof makeColors>[0] },
  moon: { label: "the Moon", scene: 'ascii-moon', alt: "The Moon drawn in ASCII characters, in today's phase, rocking gently", sun: 'moon' as SunMode, glass: '#050608', look: {"label":"ASCII Moon","only":"dark","roles":{"accent":"#9aa6b8","danger":"#e0604f","success":"#5aa23f","warning":"#e0a23f","pro":"#a07ce0"},"dark":{"gray":{"anchors":{"surface-0":"#050608","surface-1":"#0b0c0e","surface-2":"#101113","surface-3":"#17181a","text-primary":"#ece8e2","text-secondary":"#bfb8ae","text-muted":"#9a9389"}}}} as Parameters<typeof makeColors>[0] },
  mars: { label: "Mars", scene: 'ascii-mars', alt: "Mars drawn in ASCII characters, slowly turning, with white polar caps", sun: 'fixed' as SunMode, glass: '#090505', look: {"label":"ASCII Mars","only":"dark","roles":{"accent":"#d0623a","danger":"#e0604f","success":"#5aa23f","warning":"#e0a23f","pro":"#a07ce0"},"dark":{"gray":{"anchors":{"surface-0":"#090505","surface-1":"#0f0b0b","surface-2":"#141010","surface-3":"#1b1717","text-primary":"#ece8e2","text-secondary":"#bfb8ae","text-muted":"#9a9389"}}}} as Parameters<typeof makeColors>[0] },
  mercury: { label: "Mercury", scene: 'ascii-mercury', alt: "Mercury drawn in ASCII characters, grey and cratered, slowly turning", sun: 'fixed' as SunMode, glass: '#070607', look: {"label":"ASCII Mercury","only":"dark","roles":{"accent":"#b39a7a","danger":"#e0604f","success":"#5aa23f","warning":"#e0a23f","pro":"#a07ce0"},"dark":{"gray":{"anchors":{"surface-0":"#070607","surface-1":"#0d0c0d","surface-2":"#121112","surface-3":"#191819","text-primary":"#ece8e2","text-secondary":"#bfb8ae","text-muted":"#9a9389"}}}} as Parameters<typeof makeColors>[0] },
  jupiter: { label: "Jupiter", scene: 'ascii-jupiter', alt: "Jupiter drawn in ASCII characters, its cloud bands drifting, with the Great Red Spot", sun: 'fixed' as SunMode, glass: '#080706', look: {"label":"ASCII Jupiter","only":"dark","roles":{"accent":"#d0a070","danger":"#e0604f","success":"#5aa23f","warning":"#e0a23f","pro":"#a07ce0"},"dark":{"gray":{"anchors":{"surface-0":"#080706","surface-1":"#0e0d0c","surface-2":"#131211","surface-3":"#1a1918","text-primary":"#ece8e2","text-secondary":"#bfb8ae","text-muted":"#9a9389"}}}} as Parameters<typeof makeColors>[0] },
  earth: { label: "Earth", scene: 'ascii-earth', alt: "Earth drawn in ASCII characters, slowly turning, with the night side lit by cities", sun: 'earth' as SunMode, glass: '#05070d', look: {"label":"ASCII Earth","only":"dark","roles":{"accent":"#4f8fe0","danger":"#e0604f","success":"#5aa23f","warning":"#e0a23f","pro":"#a07ce0"},"dark":{"gray":{"anchors":{"surface-0":"#05070d","surface-1":"#0b0d13","surface-2":"#101218","surface-3":"#17191f","text-primary":"#ece8e2","text-secondary":"#bfb8ae","text-muted":"#9a9389"}}}} as Parameters<typeof makeColors>[0] },
  saturn: { label: "Saturn", scene: 'ascii-saturn', alt: "Saturn drawn in ASCII characters, its rings tilted toward the viewer, slowly turning", sun: 'fixed' as SunMode, glass: '#080706', look: {"label":"ASCII Saturn","only":"dark","roles":{"accent":"#d8c28a","danger":"#e0604f","success":"#5aa23f","warning":"#e0a23f","pro":"#a07ce0"},"dark":{"gray":{"anchors":{"surface-0":"#080706","surface-1":"#0e0d0c","surface-2":"#131211","surface-3":"#1a1918","text-primary":"#ece8e2","text-secondary":"#bfb8ae","text-muted":"#9a9389"}}}} as Parameters<typeof makeColors>[0] },
}
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
    if (shown === 'sun' && e.props.scene === 'ascii-sun') {
      return (
        <Shader module="./sun.shader.ts" values={sun}>
          <Svg source={SCENE_SUN} alt={BODIES.sun.alt} isInteractive />
        </Shader>
      )
    }
    if (shown === 'moon' && e.props.scene === 'ascii-moon') {
      return (
        <Shader module="./moon.shader.ts" values={sun}>
          <Svg source={SCENE_MOON} alt={BODIES.moon.alt} isInteractive />
        </Shader>
      )
    }
    if (shown === 'mars' && e.props.scene === 'ascii-mars') {
      return (
        <Shader module="./mars.shader.ts" values={sun}>
          <Svg source={SCENE_MARS} alt={BODIES.mars.alt} isInteractive />
        </Shader>
      )
    }
    if (shown === 'mercury' && e.props.scene === 'ascii-mercury') {
      return (
        <Shader module="./mercury.shader.ts" values={sun}>
          <Svg source={SCENE_MERCURY} alt={BODIES.mercury.alt} isInteractive />
        </Shader>
      )
    }
    if (shown === 'jupiter' && e.props.scene === 'ascii-jupiter') {
      return (
        <Shader module="./jupiter.shader.ts" values={sun}>
          <Svg source={SCENE_JUPITER} alt={BODIES.jupiter.alt} isInteractive />
        </Shader>
      )
    }
    if (shown === 'earth' && e.props.scene === 'ascii-earth') {
      return (
        <Shader module="./earth.shader.ts" values={sun}>
          <Svg source={SCENE_EARTH} alt={BODIES.earth.alt} isInteractive />
        </Shader>
      )
    }
    if (shown === 'saturn' && e.props.scene === 'ascii-saturn') {
      return (
        <Shader module="./saturn.shader.ts" values={sun}>
          <Svg source={SCENE_SATURN} alt={BODIES.saturn.alt} isInteractive />
        </Shader>
      )
    }
    return next(e)
  })
}
