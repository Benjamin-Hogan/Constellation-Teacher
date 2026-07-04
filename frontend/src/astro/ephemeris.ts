import {
  Body,
  Equator,
  Illumination,
  MoonPhase,
  Observer,
  SearchAltitude,
  SearchRiseSet,
} from 'astronomy-engine'
import { computeSkyState, toHorizontal } from './sky'
import type { HorizontalCoord, SkyState } from './sky'

const DEG = Math.PI / 180
/** One sidereal hour expressed in solar hours */
const SIDEREAL = 0.9972695663

export type Twilight = 'day' | 'civil' | 'nautical' | 'astronomical' | 'night'

export interface BodyPosition {
  raHours: number
  decDeg: number
  pos: HorizontalCoord
}

export interface SkyConditions {
  sun: BodyPosition
  moon: BodyPosition & {
    /** 0 (new) .. 1 (full) */
    illumination: number
    /** 0-360, 0 = new, 90 = first quarter, 180 = full */
    phaseAngle: number
    phaseName: string
  }
  twilight: Twilight
  /** Faintest magnitude visible given twilight and moonlight */
  limitingMag: number
}

export function moonPhaseName(angle: number): string {
  const names = [
    'New moon',
    'Waxing crescent',
    'First quarter',
    'Waxing gibbous',
    'Full moon',
    'Waning gibbous',
    'Last quarter',
    'Waning crescent',
  ]
  return names[Math.round(angle / 45) % 8]
}

function twilightFromSunAlt(sunAltDeg: number): Twilight {
  if (sunAltDeg > 0) return 'day'
  if (sunAltDeg > -6) return 'civil'
  if (sunAltDeg > -12) return 'nautical'
  if (sunAltDeg > -18) return 'astronomical'
  return 'night'
}

/**
 * Faintest visible magnitude, blending smoothly with sun altitude and reduced
 * by moonlight when the moon is up. Rough but pedagogically honest numbers:
 * ~6.2 under dark skies, ~4 under a high full moon, nothing in daylight.
 */
function limitingMagnitude(sunAltDeg: number, moonAltDeg: number, moonIllum: number): number {
  const stops: [number, number][] = [
    [6, -4],
    [0, -1],
    [-6, 2.5],
    [-12, 4.5],
    [-18, 6.2],
  ]
  let lim: number
  if (sunAltDeg >= stops[0][0]) {
    lim = stops[0][1]
  } else if (sunAltDeg <= stops[stops.length - 1][0]) {
    lim = stops[stops.length - 1][1]
  } else {
    lim = stops[0][1]
    for (let i = 0; i < stops.length - 1; i++) {
      const [a0, m0] = stops[i]
      const [a1, m1] = stops[i + 1]
      if (sunAltDeg <= a0 && sunAltDeg >= a1) {
        lim = m0 + ((sunAltDeg - a0) / (a1 - a0)) * (m1 - m0)
        break
      }
    }
  }
  if (moonAltDeg > 0) {
    lim -= 2.2 * moonIllum * Math.sin(moonAltDeg * DEG)
  }
  return lim
}

export function computeSkyConditions(date: Date, lat: number, lon: number): SkyConditions {
  const sky = computeSkyState(date, lat, lon)
  const observer = new Observer(lat, lon, 0)

  const sunEq = Equator(Body.Sun, date, observer, true, true)
  const sunPos = toHorizontal(sunEq.ra, sunEq.dec, sky)

  const moonEq = Equator(Body.Moon, date, observer, true, true)
  const moonPos = toHorizontal(moonEq.ra, moonEq.dec, sky)
  const illum = Illumination(Body.Moon, date)
  const phaseAngle = MoonPhase(date)

  const sunAltDeg = sunPos.alt / DEG
  const moonAltDeg = moonPos.alt / DEG

  return {
    sun: { raHours: sunEq.ra, decDeg: sunEq.dec, pos: sunPos },
    moon: {
      raHours: moonEq.ra,
      decDeg: moonEq.dec,
      pos: moonPos,
      illumination: illum.phase_fraction,
      phaseAngle,
      phaseName: moonPhaseName(phaseAngle),
    },
    twilight: twilightFromSunAlt(sunAltDeg),
    limitingMag: limitingMagnitude(sunAltDeg, moonAltDeg, illum.phase_fraction),
  }
}

// --- Rise/set events -------------------------------------------------------

export interface SkyEvent {
  time: Date
  azDeg: number
}

export interface NightEvents {
  sunset: SkyEvent | null
  sunrise: SkyEvent | null
  /** Astronomical darkness begins / ends (sun crosses -18 deg) */
  darkStart: Date | null
  darkEnd: Date | null
  moonrise: SkyEvent | null
  moonset: SkyEvent | null
}

function azimuthAt(body: Body, time: Date, lat: number, lon: number): number {
  const sky = computeSkyState(time, lat, lon)
  const eq = Equator(body, time, new Observer(lat, lon, 0), true, true)
  return toHorizontal(eq.ra, eq.dec, sky).az / DEG
}

function eventFor(
  body: Body,
  direction: 1 | -1,
  start: Date,
  lat: number,
  lon: number,
): SkyEvent | null {
  const t = SearchRiseSet(body, new Observer(lat, lon, 0), direction, start, 1.5)
  if (!t) return null
  return { time: t.date, azDeg: azimuthAt(body, t.date, lat, lon) }
}

/**
 * Events for "the night of" the given date: search starts at local noon so
 * sunset comes first, then darkness, then sunrise the next morning.
 */
export function computeNightEvents(date: Date, lat: number, lon: number): NightEvents {
  const noon = new Date(date)
  noon.setHours(12, 0, 0, 0)
  const observer = new Observer(lat, lon, 0)

  const sunset = eventFor(Body.Sun, -1, noon, lat, lon)
  const sunrise = eventFor(Body.Sun, +1, sunset ? sunset.time : noon, lat, lon)
  const darkStart = SearchAltitude(Body.Sun, observer, -1, noon, 1.5, -18)
  const darkEnd = darkStart
    ? SearchAltitude(Body.Sun, observer, +1, darkStart.date, 1.5, -18)
    : null

  return {
    sunset,
    sunrise,
    darkStart: darkStart?.date ?? null,
    darkEnd: darkEnd?.date ?? null,
    moonrise: eventFor(Body.Moon, +1, noon, lat, lon),
    moonset: eventFor(Body.Moon, -1, noon, lat, lon),
  }
}

// --- Rise/set for a fixed RA/Dec (constellations) ---------------------------

export type FixedVisibility =
  | { kind: 'circumpolar'; culmination: Date }
  | { kind: 'never' }
  | { kind: 'normal'; rise: SkyEvent; culmination: Date; set: SkyEvent }

/**
 * Rise, culmination, and set of a fixed point on the celestial sphere,
 * relative to the given date/time (next culmination after `date`).
 */
export function fixedRiseSet(
  raHours: number,
  decDeg: number,
  date: Date,
  lat: number,
  sky: SkyState,
): FixedVisibility {
  const dec = decDeg * DEG
  const latRad = lat * DEG

  // Next culmination: when LST catches up to the star's RA
  const dLst = (((raHours - sky.lst) % 24) + 24) % 24
  const culmination = new Date(date.getTime() + dLst * SIDEREAL * 3600 * 1000)

  const cosH0 = -Math.tan(latRad) * Math.tan(dec)
  if (cosH0 < -1) return { kind: 'circumpolar', culmination }
  if (cosH0 > 1) return { kind: 'never' }

  const h0Hours = (Math.acos(cosH0) / DEG / 15) * SIDEREAL
  const riseAz = Math.acos(Math.sin(dec) / Math.cos(latRad)) / DEG

  return {
    kind: 'normal',
    rise: {
      time: new Date(culmination.getTime() - h0Hours * 3600 * 1000),
      azDeg: riseAz,
    },
    culmination,
    set: {
      time: new Date(culmination.getTime() + h0Hours * 3600 * 1000),
      azDeg: 360 - riseAz,
    },
  }
}

const COMPASS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
]

export function compassName(azDeg: number): string {
  return COMPASS[Math.round((((azDeg % 360) + 360) % 360) / 22.5) % 16]
}
