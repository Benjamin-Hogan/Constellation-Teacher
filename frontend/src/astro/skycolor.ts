/**
 * Sky background colors as a function of Sun altitude, with a moonlight
 * contribution at night. Colors are kept darker than reality so the chart
 * stays readable.
 */

type Rgb = [number, number, number]

interface Stop {
  sunAlt: number
  zenith: Rgb
  horizon: Rgb
}

// From daylight down through the twilights to full night
const STOPS: Stop[] = [
  { sunAlt: 15, zenith: [64, 118, 189], horizon: [141, 178, 226] },
  { sunAlt: 0, zenith: [38, 62, 110], horizon: [214, 130, 74] },
  { sunAlt: -6, zenith: [20, 34, 70], horizon: [120, 82, 90] },
  { sunAlt: -12, zenith: [12, 20, 46], horizon: [42, 56, 92] },
  { sunAlt: -18, zenith: [9, 14, 30], horizon: [16, 24, 48] },
]

const MOON_ZENITH: Rgb = [26, 40, 72]
const MOON_HORIZON: Rgb = [36, 52, 88]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

function css([r, g, b]: Rgb): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
}

export interface SkyPalette {
  zenith: string
  horizon: string
}

/**
 * @param sunAltDeg Sun altitude in degrees
 * @param moonFactor 0..1 moonlight strength (illumination x sin of moon altitude)
 */
export function skyPalette(sunAltDeg: number, moonFactor: number): SkyPalette {
  let zenith: Rgb
  let horizon: Rgb
  if (sunAltDeg >= STOPS[0].sunAlt) {
    zenith = STOPS[0].zenith
    horizon = STOPS[0].horizon
  } else if (sunAltDeg <= STOPS[STOPS.length - 1].sunAlt) {
    zenith = STOPS[STOPS.length - 1].zenith
    horizon = STOPS[STOPS.length - 1].horizon
  } else {
    zenith = STOPS[0].zenith
    horizon = STOPS[0].horizon
    for (let i = 0; i < STOPS.length - 1; i++) {
      const hi = STOPS[i]
      const lo = STOPS[i + 1]
      if (sunAltDeg <= hi.sunAlt && sunAltDeg >= lo.sunAlt) {
        const t = (hi.sunAlt - sunAltDeg) / (hi.sunAlt - lo.sunAlt)
        zenith = lerpRgb(hi.zenith, lo.zenith, t)
        horizon = lerpRgb(hi.horizon, lo.horizon, t)
        break
      }
    }
  }
  // Moonlight only matters once the sun is well down
  if (sunAltDeg < -12 && moonFactor > 0) {
    const t = Math.min(1, moonFactor) * Math.min(1, (-12 - sunAltDeg) / 6)
    zenith = lerpRgb(zenith, MOON_ZENITH, t)
    horizon = lerpRgb(horizon, MOON_HORIZON, t)
  }
  return { zenith: css(zenith), horizon: css(horizon) }
}
