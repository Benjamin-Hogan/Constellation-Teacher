import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import type { ConstellationLines, ConstellationMeta, Mode, Star, User } from './types'
import {
  buildHipIndex,
  computePositions,
  computeSkyState,
  constellationCenter,
  visibleConstellations,
} from './astro/sky'
import { computeNightEvents, computeSkyConditions, fixedRiseSet } from './astro/ephemeris'
import StarMap from './components/StarMap'
import type { ViewMode } from './components/StarMap'
import ControlPanel from './components/ControlPanel'
import InfoPanel from './components/InfoPanel'
import type { FinderInfo } from './components/InfoPanel'
import AuthPanel from './components/AuthPanel'
import SkyTonight from './components/SkyTonight'
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
  const [viewMode, setViewMode] = useState<ViewMode>('overhead')
  const [realistic, setRealistic] = useState(true)
  const [showGrid, setShowGrid] = useState(false)

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

  const skyState = useMemo(() => computeSkyState(date, lat, lon), [date, lat, lon])

  const positions = useMemo(
    () => (stars ? computePositions(stars, skyState) : []),
    [stars, skyState],
  )

  const conditions = useMemo(() => computeSkyConditions(date, lat, lon), [date, lat, lon])
  const nightEvents = useMemo(() => computeNightEvents(date, lat, lon), [date, lat, lon])

  const visible = useMemo(
    () => (stars ? visibleConstellations(stars, positions, lines, hipIndex) : []),
    [stars, positions, lines, hipIndex],
  )
  const visibleSet = useMemo(() => new Set(visible.map((v) => v.abbr)), [visible])

  const finder = useMemo<FinderInfo | null>(() => {
    if (!stars || !selected) return null
    const con = linesByAbbr.get(selected)
    if (!con) return null
    const center = constellationCenter(con, stars, hipIndex)
    if (!center) return null
    return {
      raHours: center.raHours,
      decDeg: center.decDeg,
      visibility: fixedRiseSet(center.raHours, center.decDeg, date, lat, skyState),
    }
  }, [stars, selected, linesByAbbr, hipIndex, date, lat, skyState])

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
              // astronomy-engine throws on out-of-range coordinates
              setLat(Math.max(-90, Math.min(90, Number.isFinite(la) ? la : 0)))
              setLon(Math.max(-180, Math.min(180, Number.isFinite(lo) ? lo : 0)))
            }}
            onDateChange={setDate}
          />
          <section className="panel">
            <h2>View</h2>
            <label className="check-row">
              <input
                type="checkbox"
                checked={realistic}
                onChange={(e) => setRealistic(e.target.checked)}
              />
              Realistic sky (sun, moon, twilight)
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
              />
              RA/Dec grid
            </label>
          </section>
          <SkyTonight events={nightEvents} conditions={conditions} />
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
        </div>

        <StarMap
          stars={stars}
          constellations={lines}
          lat={lat}
          lon={lon}
          date={date}
          conditions={conditions}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          realistic={realistic}
          showGrid={showGrid}
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
            finder={finder}
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
