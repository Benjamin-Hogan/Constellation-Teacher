import type { ConstellationLines, ConstellationMeta } from '../types'
import type { FixedVisibility } from '../astro/ephemeris'
import { compassName } from '../astro/ephemeris'

export interface FinderInfo {
  raHours: number
  decDeg: number
  visibility: FixedVisibility | null
}

interface Props {
  meta: ConstellationMeta
  lines: ConstellationLines | undefined
  finder: FinderInfo | null
  isVisible: boolean
  isLearned: boolean
  onToggleLearned: () => void
  onClose: () => void
}

function fmtRa(raHours: number): string {
  const h = Math.floor(raHours)
  const m = Math.round((raHours - h) * 60)
  return m === 60 ? `${(h + 1) % 24}h 00m` : `${h}h ${String(m).padStart(2, '0')}m`
}

function fmtDec(decDeg: number): string {
  return `${decDeg >= 0 ? '+' : '−'}${Math.abs(decDeg).toFixed(0)}°`
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function visibilityText(vis: FixedVisibility): string {
  switch (vis.kind) {
    case 'circumpolar':
      return `Circumpolar from your latitude — it never sets. Highest at ${fmtTime(vis.culmination)}.`
    case 'never':
      return 'Never rises above the horizon from your latitude.'
    case 'normal':
      return `Rises ${fmtTime(vis.rise.time)} in the ${compassName(vis.rise.azDeg)}, highest at ${fmtTime(vis.culmination)}, sets ${fmtTime(vis.set.time)} in the ${compassName(vis.set.azDeg)}.`
  }
}

export default function InfoPanel({
  meta,
  lines,
  finder,
  isVisible,
  isLearned,
  onToggleLearned,
  onClose,
}: Props) {
  return (
    <aside className="panel info-panel">
      <div className="info-header">
        <div>
          <h2>{meta.name}</h2>
          <p className="subtitle">
            {meta.meaning}
            {lines?.english && lines.english !== meta.meaning ? ` · "${lines.english}"` : ''}
          </p>
        </div>
        <button className="btn subtle close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <p className={isVisible ? 'badge up' : 'badge down'}>
        {isVisible ? 'Above the horizon now' : 'Below the horizon at this time'}
      </p>

      {finder && (
        <>
          <h3>Where to find it</h3>
          <p>
            RA {fmtRa(finder.raHours)} · Dec {fmtDec(finder.decDeg)}
          </p>
          {finder.visibility && <p>{visibilityText(finder.visibility)}</p>}
        </>
      )}

      <h3>Mythology</h3>
      <p>{meta.mythology}</p>

      <h3>Notable stars</h3>
      <p>{meta.notableStars.join(', ')}</p>

      <h3>Best viewing</h3>
      <p>Highest in the evening sky around {meta.bestMonth}.</p>

      <h3>Did you know?</h3>
      <p>{meta.funFact}</p>

      <button className={isLearned ? 'btn learned' : 'btn primary'} onClick={onToggleLearned}>
        {isLearned ? '✓ Learned — click to unmark' : 'Mark as learned'}
      </button>
    </aside>
  )
}
