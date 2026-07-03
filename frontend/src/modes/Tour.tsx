import { useEffect, useMemo, useState } from 'react'
import type { ConstellationMeta } from '../types'
import type { VisibleConstellation } from '../astro/sky'

const TOUR_LENGTH = 8

interface Props {
  visible: VisibleConstellation[]
  metaByAbbr: Map<string, ConstellationMeta>
  learned: Set<string>
  onHighlight: (abbr: string | null) => void
  onToggleLearned: (abbr: string) => void
}

export default function Tour({ visible, metaByAbbr, learned, onHighlight, onToggleLearned }: Props) {
  // Snapshot the stops when the tour starts so scrubbing time mid-tour
  // doesn't reshuffle the itinerary under the user.
  const stops = useMemo(() => visible.slice(0, TOUR_LENGTH), [visible])
  const [index, setIndex] = useState(0)

  const stop = stops[Math.min(index, stops.length - 1)]
  const meta = stop ? metaByAbbr.get(stop.abbr) : undefined

  useEffect(() => {
    onHighlight(stop?.abbr ?? null)
    return () => onHighlight(null)
  }, [stop, onHighlight])

  useEffect(() => {
    if (index >= stops.length) setIndex(0)
  }, [stops, index])

  if (!stop || !meta) {
    return (
      <aside className="panel info-panel">
        <h2>Tonight's tour</h2>
        <p>
          No constellations are well placed right now. Try a different time — most are
          easiest to see a few hours after sunset.
        </p>
      </aside>
    )
  }

  return (
    <aside className="panel info-panel">
      <p className="tour-step">
        Stop {index + 1} of {stops.length}
      </p>
      <h2>{meta.name}</h2>
      <p className="subtitle">{meta.meaning}</p>
      <p className="badge up">
        {Math.round(stop.altitude)}° above the horizon
      </p>

      <h3>The story</h3>
      <p>{meta.mythology}</p>

      <h3>Look for</h3>
      <p>{meta.notableStars.join(', ')}</p>

      <p className="hint">{meta.funFact}</p>

      <button
        className={learned.has(stop.abbr) ? 'btn learned' : 'btn primary'}
        onClick={() => onToggleLearned(stop.abbr)}
      >
        {learned.has(stop.abbr) ? '✓ Learned' : 'Mark as learned'}
      </button>

      <div className="tour-nav">
        <button className="btn subtle" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          ← Previous
        </button>
        <button
          className="btn subtle"
          disabled={index >= stops.length - 1}
          onClick={() => setIndex(index + 1)}
        >
          Next →
        </button>
      </div>
    </aside>
  )
}
