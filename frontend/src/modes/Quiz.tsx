import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import type { ConstellationMeta, User } from '../types'
import type { VisibleConstellation } from '../astro/sky'

const QUIZ_LENGTH = 8

export interface MapSelection {
  abbr: string
  n: number
}

interface Question {
  abbr: string
  type: 'find' | 'name'
  /** Multiple-choice options (abbrs) for 'name' questions */
  choices: string[]
}

interface Props {
  visible: VisibleConstellation[]
  metaByAbbr: Map<string, ConstellationMeta>
  allMeta: ConstellationMeta[]
  user: User | null
  mapSelection: MapSelection | null
  onHighlight: (abbr: string | null) => void
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildQuestions(visible: VisibleConstellation[], allMeta: ConstellationMeta[]): Question[] {
  const pool = shuffle(visible).slice(0, QUIZ_LENGTH)
  return pool.map((v) => {
    const type: Question['type'] = Math.random() < 0.5 ? 'find' : 'name'
    const others = shuffle(allMeta.map((m) => m.abbr).filter((a) => a !== v.abbr)).slice(0, 3)
    return { abbr: v.abbr, type, choices: shuffle([v.abbr, ...others]) }
  })
}

export default function Quiz({
  visible,
  metaByAbbr,
  allMeta,
  user,
  mapSelection,
  onHighlight,
}: Props) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [idx, setIdx] = useState(0)
  const [score, setScore] = useState(0)
  const [phase, setPhase] = useState<'asking' | 'feedback' | 'done'>('asking')
  const [lastCorrect, setLastCorrect] = useState(false)
  const [lastAnswer, setLastAnswer] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const startRound = useCallback(() => {
    setQuestions(buildQuestions(visible, allMeta))
    setIdx(0)
    setScore(0)
    setPhase('asking')
    setSaved(false)
  }, [visible, allMeta])

  useEffect(() => {
    startRound()
    // Only build the round once on mount; scrubbing time mid-quiz keeps the round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const question = questions[idx]

  // Highlight the target during 'name' questions and during feedback
  useEffect(() => {
    if (!question || phase === 'done') {
      onHighlight(null)
      return
    }
    if (phase === 'feedback' || question.type === 'name') {
      onHighlight(question.abbr)
    } else {
      onHighlight(null)
    }
    return () => onHighlight(null)
  }, [question, phase, onHighlight])

  const answer = useCallback(
    (abbr: string) => {
      if (!question || phase !== 'asking') return
      const correct = abbr === question.abbr
      setLastCorrect(correct)
      setLastAnswer(abbr)
      if (correct) setScore((s) => s + 1)
      setPhase('feedback')
    },
    [question, phase],
  )

  // Map clicks answer 'find' questions
  useEffect(() => {
    if (mapSelection && question?.type === 'find' && phase === 'asking') {
      answer(mapSelection.abbr)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapSelection?.n])

  const next = () => {
    if (idx + 1 >= questions.length) {
      setPhase('done')
    } else {
      setIdx(idx + 1)
      setPhase('asking')
    }
  }

  useEffect(() => {
    if (phase === 'done' && user && !saved && questions.length > 0) {
      setSaved(true)
      api.saveQuizResult(score, questions.length).catch(() => setSaved(false))
    }
  }, [phase, user, saved, score, questions.length])

  if (visible.length < 4) {
    return (
      <aside className="panel info-panel">
        <h2>Quiz</h2>
        <p>
          Not enough constellations are high in the sky right now to make a good quiz.
          Try a different time of night.
        </p>
      </aside>
    )
  }

  if (phase === 'done') {
    return (
      <aside className="panel info-panel">
        <h2>Round complete</h2>
        <p className="quiz-score">
          {score} / {questions.length}
        </p>
        <p>
          {score === questions.length
            ? 'Perfect! You know this sky.'
            : score >= questions.length * 0.6
              ? 'Nice work — a few more rounds and you will have these down.'
              : 'Keep exploring — try the guided tour, then quiz yourself again.'}
        </p>
        {user ? (
          <p className="hint">{saved ? 'Score saved to your profile.' : 'Saving score…'}</p>
        ) : (
          <p className="hint">Log in to save your quiz scores.</p>
        )}
        <button className="btn primary" onClick={startRound}>
          Play again
        </button>
      </aside>
    )
  }

  if (!question) return null
  const targetMeta = metaByAbbr.get(question.abbr)

  return (
    <aside className="panel info-panel">
      <p className="tour-step">
        Question {idx + 1} of {questions.length} · Score {score}
      </p>

      {phase === 'asking' && question.type === 'find' && (
        <>
          <h2>Find it</h2>
          <p>
            Click on <strong>{targetMeta?.name}</strong> ({targetMeta?.meaning}) on the map.
          </p>
          <p className="hint">Drag to pan, scroll to zoom. Labels are hidden — no peeking.</p>
        </>
      )}

      {phase === 'asking' && question.type === 'name' && (
        <>
          <h2>Name it</h2>
          <p>Which constellation is highlighted on the map?</p>
          <div className="choices">
            {question.choices.map((abbr) => (
              <button key={abbr} className="btn choice" onClick={() => answer(abbr)}>
                {metaByAbbr.get(abbr)?.name ?? abbr}
              </button>
            ))}
          </div>
        </>
      )}

      {phase === 'feedback' && (
        <>
          <h2>{lastCorrect ? 'Correct!' : 'Not quite'}</h2>
          {!lastCorrect && (
            <p>
              You picked <strong>{metaByAbbr.get(lastAnswer ?? '')?.name ?? '—'}</strong>. The
              answer is <strong>{targetMeta?.name}</strong>, now highlighted on the map.
            </p>
          )}
          {lastCorrect && <p>That is {targetMeta?.name} — {targetMeta?.meaning}.</p>}
          <p className="hint">{targetMeta?.funFact}</p>
          <button className="btn primary" onClick={next}>
            {idx + 1 >= questions.length ? 'See results' : 'Next question'}
          </button>
        </>
      )}
    </aside>
  )
}
