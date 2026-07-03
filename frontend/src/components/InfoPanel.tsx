import type { ConstellationLines, ConstellationMeta } from '../types'

interface Props {
  meta: ConstellationMeta
  lines: ConstellationLines | undefined
  isVisible: boolean
  isLearned: boolean
  onToggleLearned: () => void
  onClose: () => void
}

export default function InfoPanel({
  meta,
  lines,
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
