import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConstellationLines, Star } from '../types'
import {
  buildHipIndex,
  computePositions,
  computeSkyState,
  toEquatorial,
  toHorizontal,
} from '../astro/sky'
import {
  OVERHEAD_CENTER,
  pointSegmentDistance,
  project,
  starColor,
  unproject,
} from '../astro/projection'
import type { ScreenPoint, View } from '../astro/projection'
import type { PlanetPosition, SkyConditions } from '../astro/ephemeris'
import { compassName } from '../astro/ephemeris'
import { skyPalette } from '../astro/skycolor'

export type ViewMode = 'overhead' | 'horizon'

interface Segment {
  abbr: string
  x1: number
  y1: number
  x2: number
  y2: number
}

interface Props {
  stars: Star[]
  constellations: ConstellationLines[]
  lat: number
  lon: number
  date: Date
  conditions: SkyConditions
  planets: PlanetPosition[]
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  realistic: boolean
  showGrid: boolean
  hovered: string | null
  selected: string | null
  /** Constellation emphasized by tour/quiz; dims everything else */
  highlight: string | null
  /** Hide constellation names (quiz mode) */
  hideLabels: boolean
  learned: Set<string>
  onHover: (abbr: string | null) => void
  onSelect: (abbr: string | null) => void
}

const DEG = Math.PI / 180
const MIN_ZOOM = 0.6
const MAX_ZOOM = 10
const HIT_RADIUS = 14
const COMPASS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

interface CursorInfo {
  altDeg: number
  azDeg: number
  raHours: number
  decDeg: number
}

function formatRa(raHours: number): string {
  const h = Math.floor(raHours)
  const m = Math.round((raHours - h) * 60)
  return m === 60 ? `${(h + 1) % 24}h 00m` : `${h}h ${String(m).padStart(2, '0')}m`
}

function formatDec(decDeg: number): string {
  return `${decDeg >= 0 ? '+' : '−'}${Math.abs(decDeg).toFixed(1)}°`
}

/** Extra magnitudes of atmospheric dimming at a given altitude (radians). */
function extinctionMag(alt: number): number {
  const airmass = Math.min(1 / Math.max(Math.sin(alt), 0.05), 15)
  return 0.25 * (airmass - 1)
}

export default function StarMap({
  stars,
  constellations,
  lat,
  lon,
  date,
  conditions,
  planets,
  viewMode,
  onViewModeChange,
  realistic,
  showGrid,
  hovered,
  selected,
  highlight,
  hideLabels,
  learned,
  onHover,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const segmentsRef = useRef<Segment[]>([])
  const viewRef = useRef<View | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [overheadView, setOverheadView] = useState({ zoom: 1, panX: 0, panY: 0 })
  const [horizonView, setHorizonView] = useState({ zoom: 1.6, azDeg: 180, altDeg: 22 })
  const [cursor, setCursor] = useState<CursorInfo | null>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    overhead: { panX: number; panY: number }
    horizon: { azDeg: number; altDeg: number }
    moved: boolean
  } | null>(null)

  const hipIndex = useMemo(() => buildHipIndex(stars), [stars])
  const skyState = useMemo(() => computeSkyState(date, lat, lon), [date, lat, lon])
  const positions = useMemo(() => computePositions(stars, skyState), [stars, skyState])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.w === 0 || size.h === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size.w * dpr
    canvas.height = size.h * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const isHorizon = viewMode === 'horizon'
    const v: View = isHorizon
      ? {
          cx: size.w / 2,
          cy: size.h / 2,
          radius: Math.min(size.w, size.h) * 0.75,
          zoom: horizonView.zoom,
          panX: 0,
          panY: 0,
          center: { az0: horizonView.azDeg * DEG, alt0: horizonView.altDeg * DEG },
        }
      : {
          cx: size.w / 2,
          cy: size.h / 2,
          radius: Math.min(size.w, size.h) / 2 - 24,
          zoom: overheadView.zoom,
          panX: overheadView.panX,
          panY: overheadView.panY,
          center: OVERHEAD_CENTER,
        }
    viewRef.current = v

    const sunAltDeg = conditions.sun.pos.alt / DEG
    const moonFactor =
      conditions.moon.pos.alt > 0
        ? conditions.moon.illumination * Math.sin(conditions.moon.pos.alt)
        : 0
    const palette = realistic
      ? skyPalette(sunAltDeg, moonFactor)
      : { zenith: '#0c1226', horizon: '#060a16' }
    const limitingMag = realistic ? conditions.limitingMag : 99

    // --- background --------------------------------------------------------
    ctx.fillStyle = '#04060c'
    ctx.fillRect(0, 0, size.w, size.h)

    let horizonScreenY = size.h * 0.72 // fallback
    if (isHorizon) {
      const hp = project({ alt: 0, az: v.center.az0 }, v)
      if (hp) horizonScreenY = hp.y
      const grad = ctx.createLinearGradient(0, 0, 0, horizonScreenY)
      grad.addColorStop(0, palette.zenith)
      grad.addColorStop(1, palette.horizon)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, size.w, size.h)
    } else {
      const hcx = v.cx + v.panX
      const hcy = v.cy + v.panY
      const hr = v.radius * v.zoom
      const grad = ctx.createRadialGradient(hcx, hcy, 0, hcx, hcy, hr)
      grad.addColorStop(0, palette.zenith)
      grad.addColorStop(1, palette.horizon)
      ctx.beginPath()
      ctx.arc(hcx, hcy, hr, 0, 2 * Math.PI)
      ctx.fillStyle = grad
      ctx.fill()
      // Clip sky drawing to the horizon circle
      ctx.save()
      ctx.beginPath()
      ctx.arc(hcx, hcy, hr, 0, 2 * Math.PI)
      ctx.clip()
      // altitude rings at 30 and 60 degrees
      ctx.strokeStyle = 'rgba(90, 120, 180, 0.10)'
      ctx.lineWidth = 1
      for (const altDeg of [30, 60]) {
        const rr = hr * Math.tan(((90 - altDeg) * Math.PI) / 360)
        ctx.beginPath()
        ctx.arc(hcx, hcy, rr, 0, 2 * Math.PI)
        ctx.stroke()
      }
    }

    // --- RA/Dec grid --------------------------------------------------------
    if (showGrid) {
      const drawPolyline = (points: (ScreenPoint | null)[]) => {
        ctx.beginPath()
        let pen = false
        let prev: ScreenPoint | null = null
        for (const p of points) {
          if (!p || (prev && Math.hypot(p.x - prev.x, p.y - prev.y) > 250)) {
            pen = false
            prev = p
            continue
          }
          if (pen) ctx.lineTo(p.x, p.y)
          else ctx.moveTo(p.x, p.y)
          pen = true
          prev = p
        }
        ctx.stroke()
      }
      const gridPoint = (ra: number, dec: number): ScreenPoint | null => {
        const pos = toHorizontal(ra, dec, skyState)
        if (pos.alt < -0.02) return null
        return project(pos, v)
      }
      ctx.lineWidth = 1
      // declination circles
      for (let dec = -60; dec <= 80; dec += 20) {
        ctx.strokeStyle = dec === 0 ? 'rgba(214, 168, 96, 0.4)' : 'rgba(214, 168, 96, 0.18)'
        const pts: (ScreenPoint | null)[] = []
        for (let ra = 0; ra <= 24.001; ra += 0.25) pts.push(gridPoint(ra, dec))
        drawPolyline(pts)
      }
      // right ascension lines
      ctx.strokeStyle = 'rgba(214, 168, 96, 0.18)'
      for (let ra = 0; ra < 24; ra += 2) {
        const pts: (ScreenPoint | null)[] = []
        for (let dec = -80; dec <= 80.001; dec += 2.5) pts.push(gridPoint(ra, dec))
        drawPolyline(pts)
      }
      // labels: dec along the meridian, RA along the celestial equator
      ctx.font = '10px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(214, 168, 96, 0.6)'
      for (let dec = -60; dec <= 80; dec += 20) {
        const p = gridPoint(skyState.lst, dec)
        if (p) ctx.fillText(`${dec > 0 ? '+' : ''}${dec}°`, p.x + 4, p.y - 4)
      }
      for (let ra = 0; ra < 24; ra += 2) {
        const p = gridPoint(ra, 0)
        if (p) ctx.fillText(`${ra}h`, p.x + 4, p.y - 4)
      }
    }

    // --- project stars ------------------------------------------------------
    const screen: (ScreenPoint | null)[] = new Array(stars.length)
    for (let i = 0; i < stars.length; i++) {
      screen[i] = positions[i].alt > 0 ? project(positions[i], v) : null
    }

    // --- constellation lines ------------------------------------------------
    const segments: Segment[] = []
    const labelAnchors = new Map<string, { x: number; y: number }>()

    for (const con of constellations) {
      const isFocus =
        con.abbr === highlight || con.abbr === hovered || con.abbr === selected
      const dimmed = highlight !== null && con.abbr !== highlight

      ctx.strokeStyle = isFocus
        ? 'rgba(140, 190, 255, 0.95)'
        : dimmed
          ? 'rgba(90, 130, 200, 0.10)'
          : 'rgba(100, 145, 215, 0.38)'
      ctx.lineWidth = isFocus ? 2 : 1.2
      ctx.beginPath()

      let sumX = 0
      let sumY = 0
      let n = 0
      for (const line of con.lines) {
        for (let i = 0; i < line.length - 1; i++) {
          const a = hipIndex.get(line[i])
          const b = hipIndex.get(line[i + 1])
          if (a === undefined || b === undefined) continue
          const pa = screen[a]
          const pb = screen[b]
          if (!pa || !pb) continue
          if (Math.hypot(pa.x - pb.x, pa.y - pb.y) > size.w) continue
          ctx.moveTo(pa.x, pa.y)
          ctx.lineTo(pb.x, pb.y)
          segments.push({ abbr: con.abbr, x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y })
          sumX += pa.x + pb.x
          sumY += pa.y + pb.y
          n += 2
        }
      }
      ctx.stroke()
      if (n > 0) labelAnchors.set(con.abbr, { x: sumX / n, y: sumY / n })
    }
    segmentsRef.current = segments

    // --- stars ---------------------------------------------------------------
    for (let i = 0; i < stars.length; i++) {
      const p = screen[i]
      if (!p) continue
      if (p.x < -10 || p.x > size.w + 10 || p.y < -10 || p.y > size.h + 10) continue
      const star = stars[i]
      const effMag = realistic ? star.mag + extinctionMag(positions[i].alt) : star.mag
      const fade = realistic ? Math.max(0, Math.min(1, (limitingMag - effMag) / 1.2)) : 1
      if (fade <= 0.02) continue
      const radius = Math.max(0.6, (6.3 - effMag) * 0.55 * Math.sqrt(v.zoom) * 0.8)
      const dimmedStar = highlight !== null && star.con !== highlight
      ctx.globalAlpha = (dimmedStar ? 0.3 : 1) * fade
      ctx.fillStyle = starColor(star.ci)
      ctx.beginPath()
      ctx.arc(p.x, p.y, radius, 0, 2 * Math.PI)
      ctx.fill()
      if (star.mag < 1.2 && !dimmedStar) {
        ctx.globalAlpha = 0.18 * fade
        ctx.beginPath()
        ctx.arc(p.x, p.y, radius * 2.6, 0, 2 * Math.PI)
        ctx.fill()
      }
      // bright-star names when zoomed in
      if (
        star.name &&
        star.mag < (v.zoom > 2.2 ? 2.8 : 0.8) &&
        !hideLabels &&
        !dimmedStar &&
        fade > 0.4
      ) {
        ctx.globalAlpha = 0.75 * fade
        ctx.fillStyle = '#9fb4d8'
        ctx.font = '10px system-ui, sans-serif'
        ctx.fillText(star.name, p.x + radius + 3, p.y + 3)
      }
      ctx.globalAlpha = 1
    }

    // --- planets ----------------------------------------------------------------
    for (const planet of planets) {
      if (planet.pos.alt <= 0) continue
      const p = project(planet.pos, v)
      if (!p) continue
      if (p.x < -10 || p.x > size.w + 10 || p.y < -10 || p.y > size.h + 10) continue
      const effMag = realistic ? planet.mag + extinctionMag(planet.pos.alt) : planet.mag
      const fade = realistic ? Math.max(0, Math.min(1, (limitingMag - effMag) / 1.2)) : 1
      if (fade <= 0.02) continue
      const dimmed = highlight !== null
      const radius = Math.max(1.6, (6.3 - effMag) * 0.55 * Math.sqrt(v.zoom) * 0.8)
      ctx.globalAlpha = (dimmed ? 0.3 : 1) * fade
      // subtle glow to set planets apart from stars
      ctx.fillStyle = planet.color
      ctx.globalAlpha *= 0.25
      ctx.beginPath()
      ctx.arc(p.x, p.y, radius * 2.2, 0, 2 * Math.PI)
      ctx.fill()
      ctx.globalAlpha = (dimmed ? 0.3 : 1) * fade
      ctx.beginPath()
      ctx.arc(p.x, p.y, radius, 0, 2 * Math.PI)
      ctx.fill()
      if (!hideLabels && !dimmed && fade > 0.3) {
        ctx.globalAlpha = 0.9 * fade
        ctx.font = 'italic 11px system-ui, sans-serif'
        ctx.fillText(planet.name, p.x + radius + 4, p.y + 4)
      }
      ctx.globalAlpha = 1
    }

    // --- Sun and Moon ---------------------------------------------------------
    if (realistic) {
      const bodyRadius = Math.max(7, 0.0045 * v.radius * v.zoom)
      const sunP = conditions.sun.pos.alt > -0.02 ? project(conditions.sun.pos, v) : null
      const moonP = conditions.moon.pos.alt > -0.02 ? project(conditions.moon.pos, v) : null

      if (sunP) {
        const glow = ctx.createRadialGradient(sunP.x, sunP.y, 0, sunP.x, sunP.y, bodyRadius * 4)
        glow.addColorStop(0, 'rgba(255, 244, 200, 0.85)')
        glow.addColorStop(1, 'rgba(255, 244, 200, 0)')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(sunP.x, sunP.y, bodyRadius * 4, 0, 2 * Math.PI)
        ctx.fill()
        ctx.fillStyle = '#fff6d8'
        ctx.beginPath()
        ctx.arc(sunP.x, sunP.y, bodyRadius, 0, 2 * Math.PI)
        ctx.fill()
        ctx.fillStyle = 'rgba(255, 246, 216, 0.9)'
        ctx.font = '11px system-ui, sans-serif'
        ctx.fillText('Sun', sunP.x + bodyRadius + 4, sunP.y + 4)
      }

      if (moonP) {
        // Rotate so the lit limb faces the sun (projected even if it is below
        // the horizon, to get the on-screen direction right).
        const sunScreen = project(conditions.sun.pos, v)
        const angle = sunScreen
          ? Math.atan2(sunScreen.y - moonP.y, sunScreen.x - moonP.x)
          : 0
        const f = conditions.moon.illumination
        ctx.save()
        ctx.translate(moonP.x, moonP.y)
        // shadowed disk
        ctx.fillStyle = 'rgba(88, 96, 116, 0.85)'
        ctx.beginPath()
        ctx.arc(0, 0, bodyRadius, 0, 2 * Math.PI)
        ctx.fill()
        // lit region: semicircle toward the sun plus elliptical terminator
        ctx.rotate(angle)
        ctx.fillStyle = '#e8ecf5'
        ctx.beginPath()
        ctx.arc(0, 0, bodyRadius, -Math.PI / 2, Math.PI / 2)
        ctx.ellipse(
          0,
          0,
          bodyRadius * Math.abs(2 * f - 1),
          bodyRadius,
          0,
          Math.PI / 2,
          -Math.PI / 2,
          f < 0.5,
        )
        ctx.fill()
        ctx.restore()
        ctx.fillStyle = 'rgba(232, 236, 245, 0.9)'
        ctx.font = '11px system-ui, sans-serif'
        ctx.fillText('Moon', moonP.x + bodyRadius + 4, moonP.y + 4)
      }
    }

    // --- constellation labels ---------------------------------------------------
    if (!hideLabels) {
      ctx.textAlign = 'center'
      for (const con of constellations) {
        const anchor = labelAnchors.get(con.abbr)
        if (!anchor) continue
        const isFocus =
          con.abbr === highlight || con.abbr === hovered || con.abbr === selected
        const dimmed = highlight !== null && con.abbr !== highlight
        if (dimmed) continue
        ctx.font = isFocus
          ? 'bold 14px system-ui, sans-serif'
          : '11px system-ui, sans-serif'
        ctx.fillStyle = isFocus
          ? 'rgba(190, 220, 255, 0.95)'
          : learned.has(con.abbr)
            ? 'rgba(150, 210, 160, 0.55)'
            : 'rgba(140, 165, 210, 0.5)'
        ctx.fillText(con.name, anchor.x, anchor.y)
      }
      ctx.textAlign = 'left'
    }

    if (isHorizon) {
      // --- ground silhouette ---------------------------------------------------
      const groundPts: ScreenPoint[] = []
      for (let d = -130; d <= 130; d += 2) {
        const p = project({ alt: 0, az: v.center.az0 + d * DEG }, v)
        if (p) groundPts.push(p)
      }
      if (groundPts.length > 1) {
        ctx.beginPath()
        ctx.moveTo(groundPts[0].x, groundPts[0].y)
        for (const p of groundPts) ctx.lineTo(p.x, p.y)
        ctx.lineTo(size.w + 60, size.h + 60)
        ctx.lineTo(-60, size.h + 60)
        ctx.closePath()
        ctx.fillStyle = '#0a0f0c'
        ctx.fill()
        // horizon line
        ctx.beginPath()
        ctx.moveTo(groundPts[0].x, groundPts[0].y)
        for (const p of groundPts) ctx.lineTo(p.x, p.y)
        ctx.strokeStyle = 'rgba(130, 160, 220, 0.5)'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
      // cardinal ticks along the horizon
      ctx.font = 'bold 12px system-ui, sans-serif'
      ctx.textAlign = 'center'
      for (let i = 0; i < 16; i++) {
        const az = i * 22.5 * DEG
        const p = project({ alt: 0, az }, v)
        if (!p || p.x < 10 || p.x > size.w - 10) continue
        const below = project({ alt: -1.5 * DEG, az }, v)
        ctx.strokeStyle = 'rgba(180, 200, 235, 0.7)'
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(below?.x ?? p.x, below?.y ?? p.y + 6)
        ctx.stroke()
        if (i % 2 === 0) {
          ctx.fillStyle = '#b8c9e8'
          ctx.fillText(COMPASS_8[i / 2], below?.x ?? p.x, (below?.y ?? p.y) + 14)
        }
      }
      ctx.textAlign = 'left'
    } else {
      ctx.restore() // end horizon-circle clip

      // --- horizon rim and cardinal directions -----------------------------------
      const hcx = v.cx + v.panX
      const hcy = v.cy + v.panY
      const hr = v.radius * v.zoom
      ctx.beginPath()
      ctx.arc(hcx, hcy, hr, 0, 2 * Math.PI)
      ctx.strokeStyle = 'rgba(130, 160, 220, 0.55)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.font = 'bold 13px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#b8c9e8'
      const cardinals: [string, number][] = [
        ['N', 0],
        ['E', 90],
        ['S', 180],
        ['W', 270],
      ]
      for (const [label, azDeg] of cardinals) {
        const az = azDeg * DEG
        const x = hcx - (hr + 13) * Math.sin(az)
        const y = hcy - (hr + 13) * Math.cos(az)
        ctx.fillText(label, x, y)
      }
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }
  }, [
    stars,
    constellations,
    positions,
    skyState,
    hipIndex,
    size,
    viewMode,
    overheadView,
    horizonView,
    conditions,
    planets,
    realistic,
    showGrid,
    hovered,
    selected,
    highlight,
    hideLabels,
    learned,
  ])

  const constellationAt = useCallback((x: number, y: number): string | null => {
    let best: string | null = null
    let bestDist = HIT_RADIUS
    for (const seg of segmentsRef.current) {
      const d = pointSegmentDistance(x, y, seg.x1, seg.y1, seg.x2, seg.y2)
      if (d < bestDist) {
        bestDist = d
        best = seg.abbr
      }
    }
    return best
  }, [])

  const updateCursor = useCallback(
    (x: number, y: number) => {
      const v = viewRef.current
      if (!v) return
      const pos = unproject(x, y, v)
      if (!pos || pos.alt < -0.35) {
        setCursor(null)
        return
      }
      const eq = toEquatorial(pos, skyState)
      setCursor({
        altDeg: pos.alt / DEG,
        azDeg: pos.az / DEG,
        raHours: eq.raHours,
        decDeg: eq.decDeg,
      })
    },
    [skyState],
  )

  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    dragRef.current = {
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      overhead: { panX: overheadView.panX, panY: overheadView.panY },
      horizon: { azDeg: horizonView.azDeg, altDeg: horizonView.altDeg },
      moved: false,
    }
    canvasRef.current!.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const drag = dragRef.current
    if (drag) {
      const dx = x - drag.startX
      const dy = y - drag.startY
      if (Math.hypot(dx, dy) > 4) drag.moved = true
      if (drag.moved) {
        if (viewMode === 'overhead') {
          setOverheadView((v) => ({
            ...v,
            panX: drag.overhead.panX + dx,
            panY: drag.overhead.panY + dy,
          }))
        } else {
          const v = viewRef.current
          const scale = v ? v.radius * v.zoom : 500
          // Near the view center a screen offset of s pixels is ~2s/scale radians
          const dAz = ((2 * dx) / scale) * (1 / Math.max(0.2, Math.cos(horizonView.altDeg * DEG)))
          const dAlt = (2 * dy) / scale
          setHorizonView((hv) => ({
            ...hv,
            azDeg: (((drag.horizon.azDeg - dAz / DEG) % 360) + 360) % 360,
            altDeg: Math.min(85, Math.max(0, drag.horizon.altDeg + dAlt / DEG)),
          }))
        }
        setCursor(null)
        return
      }
    }
    onHover(constellationAt(x, y))
    updateCursor(x, y)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag && drag.moved) return
    const rect = canvasRef.current!.getBoundingClientRect()
    onSelect(constellationAt(e.clientX - rect.left, e.clientY - rect.top))
  }

  const handleWheel = (e: React.WheelEvent) => {
    const factor = Math.exp(-e.deltaY * 0.0015)
    if (viewMode === 'horizon') {
      setHorizonView((v) => ({
        ...v,
        zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor)),
      }))
      return
    }
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setOverheadView((v) => {
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor))
      const k = newZoom / v.zoom
      const cx = size.w / 2
      const cy = size.h / 2
      return {
        zoom: newZoom,
        panX: x - cx - (x - cx - v.panX) * k,
        panY: y - cy - (y - cy - v.panY) * k,
      }
    })
  }

  return (
    <div ref={containerRef} className="starmap-container">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', cursor: hovered ? 'pointer' : 'grab' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          onHover(null)
          setCursor(null)
        }}
        onWheel={handleWheel}
      />

      <div className="map-tabs">
        <button
          className={viewMode === 'overhead' ? 'map-tab active' : 'map-tab'}
          onClick={() => onViewModeChange('overhead')}
        >
          Overhead
        </button>
        <button
          className={viewMode === 'horizon' ? 'map-tab active' : 'map-tab'}
          onClick={() => onViewModeChange('horizon')}
        >
          Horizon
        </button>
      </div>

      {viewMode === 'horizon' && (
        <div className="compass-bar">
          {COMPASS_8.map((name, i) => (
            <button
              key={name}
              className={
                Math.round((((horizonView.azDeg % 360) + 360) % 360) / 45) % 8 === i
                  ? 'compass-btn active'
                  : 'compass-btn'
              }
              onClick={() => setHorizonView((v) => ({ ...v, azDeg: i * 45, altDeg: 22 }))}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {cursor && (
        <div className="cursor-readout">
          <span>
            Alt {cursor.altDeg.toFixed(1)}° · Az {cursor.azDeg.toFixed(0)}° (
            {compassName(cursor.azDeg)})
          </span>
          <span>
            RA {formatRa(cursor.raHours)} · Dec {formatDec(cursor.decDeg)}
          </span>
        </div>
      )}

      <button
        className="reset-view"
        onClick={() =>
          viewMode === 'overhead'
            ? setOverheadView({ zoom: 1, panX: 0, panY: 0 })
            : setHorizonView({ zoom: 1.6, azDeg: 180, altDeg: 22 })
        }
        title="Reset view"
      >
        Reset view
      </button>
    </div>
  )
}
