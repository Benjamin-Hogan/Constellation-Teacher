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

/** Inverse of toHorizontal: alt/az back to RA (hours) and Dec (degrees). */
export function toEquatorial(pos: HorizontalCoord, sky: SkyState): { raHours: number; decDeg: number } {
  const sinDec =
    Math.sin(pos.alt) * Math.sin(sky.latRad) +
    Math.cos(pos.alt) * Math.cos(sky.latRad) * Math.cos(pos.az)
  const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)))
  const ha = Math.atan2(
    -Math.sin(pos.az) * Math.cos(pos.alt),
    (Math.sin(pos.alt) - sinDec * Math.sin(sky.latRad)) / Math.cos(sky.latRad),
  )
  const raHours = (((sky.lst - ha / DEG / 15) % 24) + 24) % 24
  return { raHours, decDeg: dec / DEG }
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

/** Mean RA/Dec of a constellation's line stars (vector average, RA-wrap safe). */
export function constellationCenter(
  con: ConstellationLines,
  stars: Star[],
  hipIndex: Map<number, number>,
): { raHours: number; decDeg: number } | null {
  const hips = new Set<number>()
  for (const seg of con.lines) for (const hip of seg) hips.add(hip)
  let x = 0
  let y = 0
  let z = 0
  let n = 0
  for (const hip of hips) {
    const idx = hipIndex.get(hip)
    if (idx === undefined) continue
    const ra = stars[idx].ra * 15 * DEG
    const dec = stars[idx].dec * DEG
    x += Math.cos(dec) * Math.cos(ra)
    y += Math.cos(dec) * Math.sin(ra)
    z += Math.sin(dec)
    n++
  }
  if (n === 0) return null
  const raHours = ((Math.atan2(y, x) / DEG / 15) % 24 + 24) % 24
  const decDeg = Math.asin(z / Math.hypot(x, y, z)) / DEG
  return { raHours, decDeg }
}

/** Map from HIP number to index in the stars array. */
export function buildHipIndex(stars: Star[]): Map<number, number> {
  const map = new Map<number, number>()
  stars.forEach((s, i) => {
    if (s.hip !== null) map.set(s.hip, i)
  })
  return map
}
