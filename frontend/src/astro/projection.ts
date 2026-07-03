import type { HorizontalCoord } from './sky'

/**
 * Stereographic projection of the sky dome onto the screen, centered on the
 * zenith — the classic planisphere view. North is at the top and east is on
 * the LEFT, matching what you see lying on your back looking up.
 */
export interface View {
  /** Canvas center, CSS pixels */
  cx: number
  cy: number
  /** Radius of the horizon circle at zoom 1, CSS pixels */
  radius: number
  zoom: number
  panX: number
  panY: number
}

export interface ScreenPoint {
  x: number
  y: number
}

export function project(pos: HorizontalCoord, view: View): ScreenPoint {
  // r = 0 at the zenith, 1 at the horizon
  const r = Math.tan((Math.PI / 2 - pos.alt) / 2)
  const scale = view.radius * view.zoom
  return {
    x: view.cx + view.panX - scale * r * Math.sin(pos.az),
    y: view.cy + view.panY - scale * r * Math.cos(pos.az),
  }
}

/** Screen position of the horizon circle center and its radius. */
export function horizonCircle(view: View): { x: number; y: number; r: number } {
  return { x: view.cx + view.panX, y: view.cy + view.panY, r: view.radius * view.zoom }
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
