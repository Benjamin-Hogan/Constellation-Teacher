import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import type { ConstellationLines, ConstellationMeta, Mode, Star, User } from './types'
import { buildHipIndex, computePositions, computeSkyState, visibleConstellations } from './astro/sky'
import StarMap from './components/StarMap'
import ControlPanel from './components/ControlPanel'
import InfoPanel from './components/InfoPanel'
import AuthPanel from './components/AuthPanel'
import Tour from './modes/Tour'
import Quiz from './modes/Quiz'
import type { MapSelection } from './modes/Quiz'

const TOTAL_CONSTELLATIONS = 88

export default function App() {
  const [stars, setStars] = useState<Star[] | null>(null)
  const [lines, setLines] = useState<ConstellationLines[]>([])
  const [meta, setMeta] = useState<ConstellationMeta[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [lat, setLat] = useState(40.7)
  const [lon, setLon] = useState(-74.0)
  const [date, setDate] = useState(() => new Date())
  const [mode, setMode] = useState<Mode>('explore')

  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [quizSelection, setQuizSelection] = useState<MapSelection | null>(null)

  const [user, setUser] = useState<User | null>(null)
  const [learned, setLearned] = useState<Set<string>>(new Set())

  useEffect(() => {
    api
      .loadData()
      .then(([s, l, m]) => {
        setStars(s)
        setLines(l)
        setMeta(m)
      })
      .catch(() =>
        setLoadError(
          'Could not load star data. Make sure the backend is running on port 3001.',
        ),
      )
  }, [])

  useEffect(() => {
    api
      .me()
      .then(({ user }) => {
        if (user) {
          setUser(user)
          return api.getProgress().then(({ learned }) => setLearned(new Set(learned)))
        }
      })
      .catch(() => {})
  }, [])

  const handleUserChange = useCallback((u: User | null) => {
    setUser(u)
    if (u) {
      api.getProgress().then(({ learned }) => setLearned(new Set(learned))).catch(() => {})
    } else {
      setLearned(new Set())
    }
  }, [])

  const metaByAbbr = useMemo(() => new Map(meta.map((m) => [m.abbr, m])), [meta])
  const linesByAbbr = useMemo(() => new Map(lines.map((l) => [l.abbr, l])), [lines])
  const hipIndex = useMemo(() => (stars ? buildHipIndex(stars) : new Map<number, number>()), [stars])

  const positions = useMemo(
    () => (stars ? computePositions(stars, computeSkyState(date, lat, lon)) : []),
    [stars, date, lat, lon],
  )

  const visible = useMemo(
    () => (stars ? visibleConstellations(stars, positions, lines, hipIndex) : []),
    [stars, positions, lines, hipIndex],
  )
  const visibleSet = useMemo(() => new Set(visible.map((v) => v.abbr)), [visible])

  const toggleLearned = useCallback(
    (abbr: string) => {
      setLearned((prev) => {
        const next = new Set(prev)
        const nowLearned = !next.has(abbr)
        if (nowLearned) next.add(abbr)
        else next.delete(abbr)
        if (user) api.setProgress(abbr, nowLearned).catch(() => {})
        return next
      })
    },
    [user],
  )

  const changeMode = (m: Mode) => {
    setMode(m)
    setSelected(null)
    setHovered(null)
    setHighlight(null)
    setQuizSelection(null)
  }

  const handleMapSelect = useCallback(
    (abbr: string | null) => {
      if (mode === 'quiz') {
        if (abbr) setQuizSelection((prev) => ({ abbr, n: (prev?.n ?? 0) + 1 }))
      } else if (mode === 'explore') {
        setSelected(abbr)
      }
    },
    [mode],
  )

  if (loadError) {
    return (
      <div className="load-screen">
        <h1>Constellation Teacher</h1>
        <p className="error">{loadError}</p>
      </div>
    )
  }

  if (!stars) {
    return (
      <div className="load-screen">
        <h1>Constellation Teacher</h1>
        <p>Loading the sky…</p>
      </div>
    )
  }

  const selectedMeta = selected ? metaByAbbr.get(selected) : undefined

  return (
    <div className="app">
      <header className="app-header">
        <h1>Constellation Teacher</h1>
        <nav className="mode-tabs">
          {(['explore', 'tour', 'quiz'] as Mode[]).map((m) => (
            <button
              key={m}
              className={mode === m ? 'tab active' : 'tab'}
              onClick={() => changeMode(m)}
            >
              {m === 'explore' ? 'Explore' : m === 'tour' ? 'Guided tour' : 'Quiz'}
            </button>
          ))}
        </nav>
        <AuthPanel user={user} onUserChange={handleUserChange} />
      </header>

      <div className="app-main">
        <div className="sidebar">
          <ControlPanel
            lat={lat}
            lon={lon}
            date={date}
            onLocationChange={(la, lo) => {
              setLat(la)
              setLon(lo)
            }}
            onDateChange={setDate}
          />
          <section className="panel">
            <h2>Progress</h2>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(learned.size / TOTAL_CONSTELLATIONS) * 100}%` }}
              />
            </div>
            <p className="hint">
              {learned.size} of {TOTAL_CONSTELLATIONS} constellations learned
              {!user && learned.size > 0 ? ' (log in to save)' : ''}
            </p>
          </section>
          {mode === 'explore' && (
            <section className="panel">
              <h2>How to use</h2>
              <p className="hint">
                Hover the map to trace constellations, click one to read its story. Drag
                to pan, scroll to zoom. Green names are ones you have learned.
              </p>
            </section>
          )}
        </div>

        <StarMap
          stars={stars}
          constellations={lines}
          lat={lat}
          lon={lon}
          date={date}
          hovered={hovered}
          selected={mode === 'explore' ? selected : null}
          highlight={highlight}
          hideLabels={mode === 'quiz'}
          learned={learned}
          onHover={setHovered}
          onSelect={handleMapSelect}
        />

        {mode === 'explore' && selected && selectedMeta && (
          <InfoPanel
            meta={selectedMeta}
            lines={linesByAbbr.get(selected)}
            isVisible={visibleSet.has(selected)}
            isLearned={learned.has(selected)}
            onToggleLearned={() => toggleLearned(selected)}
            onClose={() => setSelected(null)}
          />
        )}

        {mode === 'tour' && (
          <Tour
            visible={visible}
            metaByAbbr={metaByAbbr}
            learned={learned}
            onHighlight={setHighlight}
            onToggleLearned={toggleLearned}
          />
        )}

        {mode === 'quiz' && (
          <Quiz
            visible={visible}
            metaByAbbr={metaByAbbr}
            allMeta={meta}
            user={user}
            mapSelection={quizSelection}
            onHighlight={setHighlight}
          />
        )}
      </div>
    </div>
  )
}
