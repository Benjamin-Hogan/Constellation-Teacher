import type { HorizontalCoord } from './sky'

/**
 * Stereographic projection of the sky onto the screen, centered on an
 * arbitrary view direction (azimuth az0, altitude alt0).
 *
 * Two flavors share the math:
 * - Overhead (planisphere): alt0 = 90 deg with az0 = 180 deg, which yields the
 *   classic look-up chart: north at the top, east on the LEFT.
 * - Horizon (first person): alt0 near the horizon, az0 = viewing direction;
 *   up is toward the zenith and azimuths right of your view appear right.
 */
export interface ViewCenter {
  /** Azimuth of view center, radians */
  az0: number
  /** Altitude of view center, radians */
  alt0: number
}

export interface View {
  /** Canvas center, CSS pixels */
  cx: number
  cy: number
  /** Projection scale at zoom 1 (horizon-circle radius in overhead view), CSS pixels */
  radius: number
  zoom: number
  panX: number
  panY: number
  center: ViewCenter
}

/** View center for the overhead planisphere: zenith, north-up/east-left. */
export const OVERHEAD_CENTER: ViewCenter = { az0: Math.PI, alt0: Math.PI / 2 }

export interface ScreenPoint {
  x: number
  y: number
}

/** Cull points more than ~110 degrees from the view center (projection blows up). */
const MIN_COS_DIST = -0.34

export function project(pos: HorizontalCoord, view: View): ScreenPoint | null {
  const { az0, alt0 } = view.center
  const dAz = pos.az - az0
  const sinAlt = Math.sin(pos.alt)
  const cosAlt = Math.cos(pos.alt)
  const sin0 = Math.sin(alt0)
  const cos0 = Math.cos(alt0)
  const cosDaz = Math.cos(dAz)

  const cosDist = sin0 * sinAlt + cos0 * cosAlt * cosDaz
  if (cosDist < MIN_COS_DIST) return null

  // Half-angle form: at alt0 = 90 this reduces to r = tan((90 - alt)/2),
  // which puts the horizon exactly at radius `view.radius`.
  const k = 1 / (1 + cosDist)
  const px = k * cosAlt * Math.sin(dAz)
  const py = k * (cos0 * sinAlt - sin0 * cosAlt * cosDaz)

  const scale = view.radius * view.zoom
  return {
    x: view.cx + view.panX + scale * px,
    y: view.cy + view.panY - scale * py,
  }
}

/** Inverse projection: screen point back to alt/az (null if outside the sphere). */
export function unproject(x: number, y: number, view: View): HorizontalCoord | null {
  const scale = view.radius * view.zoom
  const px = (x - view.cx - view.panX) / scale
  const py = -(y - view.cy - view.panY) / scale

  const rho = Math.hypot(px, py)
  const c = 2 * Math.atan(rho) // because forward used the half-angle form
  if (c > Math.PI * 0.999) return null
  const sinC = Math.sin(c)
  const cosC = Math.cos(c)
  const { az0, alt0 } = view.center
  const sin0 = Math.sin(alt0)
  const cos0 = Math.cos(alt0)

  const alt =
    rho === 0
      ? alt0
      : Math.asin(Math.max(-1, Math.min(1, cosC * sin0 + (py * sinC * cos0) / rho)))
  const az =
    rho === 0
      ? az0
      : az0 + Math.atan2(px * sinC, rho * cos0 * cosC - py * sin0 * sinC)

  return { alt, az: ((az % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) }
}

/** Distance from point p to the segment (a, b). */
export function pointSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const qx = ax + t * dx
  const qy = ay + t * dy
  return Math.hypot(px - qx, py - qy)
}

/** Approximate RGB for a star from its B-V color index. */
export function starColor(bv: number): string {
  const t = Math.max(-0.4, Math.min(2.0, bv))
  let r: number, g: number, b: number
  if (t < 0.4) {
    // blue-white
    const k = (t + 0.4) / 0.8
    r = 0.65 + 0.35 * k
    g = 0.75 + 0.25 * k
    b = 1.0
  } else if (t < 1.0) {
    // white to yellow
    const k = (t - 0.4) / 0.6
    r = 1.0
    g = 1.0 - 0.1 * k
    b = 1.0 - 0.35 * k
  } else {
    // orange to red
    const k = (t - 1.0) / 1.0
    r = 1.0
    g = 0.9 - 0.4 * k
    b = 0.65 - 0.45 * k
  }
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
}
