import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConstellationLines, Star } from '../types'
import { buildHipIndex, computePositions, computeSkyState } from '../astro/sky'
import {
  horizonCircle,
  pointSegmentDistance,
  project,
  starColor,
} from '../astro/projection'
import type { View } from '../astro/projection'

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

const MIN_ZOOM = 0.6
const MAX_ZOOM = 10
const HIT_RADIUS = 14

export default function StarMap({
  stars,
  constellations,
  lat,
  lon,
  date,
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
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 })
  const dragRef = useRef<{
    startX: number
    startY: number
    panX: number
    panY: number
    moved: boolean
  } | null>(null)

  const hipIndex = useMemo(() => buildHipIndex(stars), [stars])

  const positions = useMemo(
    () => computePositions(stars, computeSkyState(date, lat, lon)),
    [stars, date, lat, lon],
  )

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

    const v: View = {
      cx: size.w / 2,
      cy: size.h / 2,
      radius: Math.min(size.w, size.h) / 2 - 24,
      zoom: view.zoom,
      panX: view.panX,
      panY: view.panY,
    }

    // --- background -----------------------------------------------------
    ctx.fillStyle = '#04060c'
    ctx.fillRect(0, 0, size.w, size.h)

    const hc = horizonCircle(v)
    const grad = ctx.createRadialGradient(hc.x, hc.y, 0, hc.x, hc.y, hc.r)
    grad.addColorStop(0, '#0c1226')
    grad.addColorStop(0.75, '#090e1e')
    grad.addColorStop(1, '#060a16')
    ctx.beginPath()
    ctx.arc(hc.x, hc.y, hc.r, 0, 2 * Math.PI)
    ctx.fillStyle = grad
    ctx.fill()

    // Clip everything sky-related to the horizon circle
    ctx.save()
    ctx.beginPath()
    ctx.arc(hc.x, hc.y, hc.r, 0, 2 * Math.PI)
    ctx.clip()

    // altitude rings at 30 and 60 degrees + zenith cross
    ctx.strokeStyle = 'rgba(90, 120, 180, 0.10)'
    ctx.lineWidth = 1
    for (const altDeg of [30, 60]) {
      const rr = hc.r * Math.tan(((90 - altDeg) * Math.PI) / 360)
      ctx.beginPath()
      ctx.arc(hc.x, hc.y, rr, 0, 2 * Math.PI)
      ctx.stroke()
    }

    // --- project stars ---------------------------------------------------
    const screen: (ReturnType<typeof project> | null)[] = new Array(stars.length)
    for (let i = 0; i < stars.length; i++) {
      screen[i] = positions[i].alt > 0 ? project(positions[i], v) : null
    }

    // --- constellation lines ---------------------------------------------
    const segments: Segment[] = []
    const labelAnchors = new Map<string, { x: number; y: number; n: number }>()

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
          ctx.moveTo(pa.x, pa.y)
          ctx.lineTo(pb.x, pb.y)
          segments.push({ abbr: con.abbr, x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y })
          sumX += pa.x + pb.x
          sumY += pa.y + pb.y
          n += 2
        }
      }
      ctx.stroke()
      if (n > 0) labelAnchors.set(con.abbr, { x: sumX / n, y: sumY / n, n })
    }
    segmentsRef.current = segments

    // --- stars ------------------------------------------------------------
    for (let i = 0; i < stars.length; i++) {
      const p = screen[i]
      if (!p) continue
      if (p.x < -10 || p.x > size.w + 10 || p.y < -10 || p.y > size.h + 10) continue
      const star = stars[i]
      const radius = Math.max(0.6, (6.3 - star.mag) * 0.55 * Math.sqrt(view.zoom) * 0.8)
      const dimmedStar = highlight !== null && star.con !== highlight
      ctx.globalAlpha = dimmedStar ? 0.3 : 1
      ctx.fillStyle = starColor(star.ci)
      ctx.beginPath()
      ctx.arc(p.x, p.y, radius, 0, 2 * Math.PI)
      ctx.fill()
      if (star.mag < 1.2 && !dimmedStar) {
        ctx.globalAlpha = 0.18
        ctx.beginPath()
        ctx.arc(p.x, p.y, radius * 2.6, 0, 2 * Math.PI)
        ctx.fill()
        ctx.globalAlpha = 1
      }
      // bright-star names when zoomed in
      if (star.name && star.mag < (view.zoom > 2.2 ? 2.8 : 0.8) && !hideLabels && !dimmedStar) {
        ctx.globalAlpha = 0.75
        ctx.fillStyle = '#9fb4d8'
        ctx.font = '10px system-ui, sans-serif'
        ctx.fillText(star.name, p.x + radius + 3, p.y + 3)
      }
      ctx.globalAlpha = 1
    }

    // --- constellation labels ----------------------------------------------
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

    ctx.restore() // end horizon clip

    // --- horizon rim and cardinal directions -------------------------------
    ctx.beginPath()
    ctx.arc(hc.x, hc.y, hc.r, 0, 2 * Math.PI)
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
      const az = (azDeg * Math.PI) / 180
      const x = hc.x - (hc.r + 13) * Math.sin(az)
      const y = hc.y - (hc.r + 13) * Math.cos(az)
      ctx.fillText(label, x, y)
    }
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }, [
    stars,
    constellations,
    positions,
    hipIndex,
    size,
    view,
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

  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    dragRef.current = {
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      panX: view.panX,
      panY: view.panY,
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
        setView((v) => ({ ...v, panX: drag.panX + dx, panY: drag.panY + dy }))
        return
      }
    }
    onHover(constellationAt(x, y))
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag && drag.moved) return
    const rect = canvasRef.current!.getBoundingClientRect()
    onSelect(constellationAt(e.clientX - rect.left, e.clientY - rect.top))
  }

  const handleWheel = (e: React.WheelEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setView((v) => {
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * Math.exp(-e.deltaY * 0.0015)))
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
        onPointerLeave={() => onHover(null)}
        onWheel={handleWheel}
      />
      <button
        className="reset-view"
        onClick={() => setView({ zoom: 1, panX: 0, panY: 0 })}
        title="Reset view"
      >
        Reset view
      </button>
    </div>
  )
}
