# ascii-earth-backdrop

A backdrop for the Claude desktop app: Earth drawn in ASCII glyphs, turning slowly behind the conversation.

- The globe turns once every four minutes.
- The lit half follows the real sun for the current time.
- On the night side, cities glow amber, and night land stays apart from the near-black sea.
- Daytime colours come from NASA's Blue Marble, and coastlines from Natural Earth.
- Around the globe sits a dark navy look with still stars.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install ascii-earth --marketplace bluetyde/ascii-earth-backdrop
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install ascii-earth --marketplace bluetyde/ascii-earth-backdrop
```

In the desktop app, where `/plugin` does not run:
1. Click **+** next to the prompt box, then **Plugins**.
2. Choose **Add marketplace** and enter `bluetyde/ascii-earth-backdrop`.
3. Choose **Add plugin**.

The backdrop draws in the desktop and mobile apps. The terminal and editors draw no backdrop.

## How it works

The mod sets a theme at session start and draws the backdrop as a GPU shader (`hooks/earth.shader.ts`) over an SVG (`hooks/scene.ts`).

**The SVG** holds two things:
- **A world map** in a fixed box at the top left, drawn in index colours a step or two off the backdrop's black, so nobody sees it. It is 360 × 180 cells, one a degree: land colours from Blue Marble, city lights from Black Marble 2016, and coastlines from Natural Earth's 1:50m land. The shader reads each cell's index back and looks its colour up in a small palette, so the globe gets far more detail than the shader's own 16 kbit data cap allows.
- **A still ASCII globe**, shown wherever the shader does not play (the mobile app, Reduce Motion).

**The shader** runs three passes:
1. **Glyphs.** It unpacks 5 × 7 bitmaps of a 12-step glyph ramp (`.,-;~+=*%$#@`), ordered by measured ink.
2. **Cells.** Once per character cell, it projects the cell onto the turning sphere, reads the map, and works out the lighting. City lights are shown only on the night side. A soft glint marks the sea where the sun is nearly overhead.
3. **Picture.** For each pixel, it reads its cell and the glyph's dot.

Cells are a fixed 9 × 13.5 points, and each pixel works out its own glyph dot, so there are no seams. The hook works out the point where the sun is overhead from the clock every two minutes, and the shader eases toward it.

## Rebuilding the data

`hooks/scene.ts` and the `@generated` block of `hooks/earth.shader.ts` are committed, so installing needs no build. To rebuild them, put these files in `data/` (all public domain):

| File | Source |
| --- | --- |
| `ne_50m_land/ne_50m_land.shp` | [Natural Earth 1:50m land](https://www.naturalearthdata.com/downloads/50m-physical-vectors/), unzipped |
| `bluemarble-2048.png` | NASA Blue Marble, a 2048 × 1024 equirectangular colour map |
| `BlackMarble_2016_global_7km.png` | [NASA Earth at Night 2016](https://earthobservatory.nasa.gov/features/NightLights), the 5760 × 3240 global map; the script crops its caption strip |

Then run:

```
npm install
npm run build
```

You can also pass the data folder as an argument: `node tools/build-earth-data.mjs <folder>`.

The script checks a few known places before it writes anything:
- the Amazon is green;
- the mid-Atlantic is sea;
- Greenland is white;
- the Sahara is tan;
- New York is lit;
- Antarctica and the open Pacific are dark.

It also checks that the SVG stays under the app's 131,072-character cap.

## Credits

- Map data: NASA Earth Observatory (Blue Marble, Black Marble 2016) and Natural Earth. All are public domain.
- Code: MIT licence, see `LICENSE`. The one exception is `hooks/make-colors.js` and `hooks/make-colors.d.ts`. They are Claude Code's own theme helper, copied unchanged as Claude Code's mod-authoring guide directs, and are not covered by this licence.
