import { SiderealTime } from 'astronomy-engine'
import type { ConstellationLines, Star } from '../types'

const DEG = Math.PI / 180

export interface SkyState {
  /** Local sidereal time in hours */
  lst: number
  latRad: number
}

export function computeSkyState(date: Date, lat: number, lon: number): SkyState {
  const gast = SiderealTime(date) // Greenwich apparent sidereal time, hours
  const lst = (((gast + lon / 15) % 24) + 24) % 24
  return { lst, latRad: lat * DEG }
}

export interface HorizontalCoord {
  /** Altitude in radians (negative = below horizon) */
  alt: number
  /** Azimuth in radians, 0 = north, increasing eastward */
  az: number
}

export function toHorizontal(raHours: number, decDeg: number, sky: SkyState): HorizontalCoord {
  const ha = (sky.lst - raHours) * 15 * DEG
  const dec = decDeg * DEG
  const sinAlt =
    Math.sin(dec) * Math.sin(sky.latRad) +
    Math.cos(dec) * Math.cos(sky.latRad) * Math.cos(ha)
  const alt = Math.asin(sinAlt)
  const az = Math.atan2(
    -Math.cos(dec) * Math.sin(ha),
    Math.sin(dec) * Math.cos(sky.latRad) -
      Math.cos(dec) * Math.sin(sky.latRad) * Math.cos(ha),
  )
  return { alt, az: az < 0 ? az + 2 * Math.PI : az }
}

/** Horizontal coordinates for every star; index-aligned with the input array. */
export function computePositions(stars: Star[], sky: SkyState): HorizontalCoord[] {
  return stars.map((s) => toHorizontal(s.ra, s.dec, sky))
}

export interface VisibleConstellation {
  abbr: string
  /** Mean altitude of line stars above the horizon, degrees */
  altitude: number
  /** Magnitude of the brightest member star */
  brightest: number
  /** Fraction of line stars above the horizon */
  fractionUp: number
}

/**
 * Constellations currently worth teaching: mostly above the horizon,
 * sorted by prominence (high in the sky and bright first).
 */
export function visibleConstellations(
  stars: Star[],
  positions: HorizontalCoord[],
  constellations: ConstellationLines[],
  hipIndex: Map<number, number>,
): VisibleConstellation[] {
  const out: VisibleConstellation[] = []
  for (const con of constellations) {
    const hips = new Set<number>()
    for (const seg of con.lines) for (const hip of seg) hips.add(hip)
    let up = 0
    let total = 0
    let altSum = 0
    let brightest = 99
    for (const hip of hips) {
      const idx = hipIndex.get(hip)
      if (idx === undefined) continue
      total++
      const pos = positions[idx]
      if (pos.alt > 0) {
        up++
        altSum += pos.alt / DEG
        brightest = Math.min(brightest, stars[idx].mag)
      }
    }
    if (total === 0 || up / total < 0.8) continue
    const altitude = altSum / up
    if (altitude < 15) continue
    out.push({ abbr: con.abbr, altitude, brightest, fractionUp: up / total })
  }
  // Prominence: altitude matters, brightness matters more per magnitude step
  out.sort(
    (a, b) => b.altitude - 12 * b.brightest - (a.altitude - 12 * a.brightest),
  )
  return out
}

/** Map from HIP number to index in the stars array. */
export function buildHipIndex(stars: Star[]): Map<number, number> {
  const map = new Map<number, number>()
  stars.forEach((s, i) => {
    if (s.hip !== null) map.set(s.hip, i)
  })
  return map
}
