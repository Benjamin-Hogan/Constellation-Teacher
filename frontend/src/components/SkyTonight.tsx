import type { NightEvents, SkyConditions } from '../astro/ephemeris'
import { compassName } from '../astro/ephemeris'

interface Props {
  events: NightEvents
  conditions: SkyConditions
}

function fmtTime(d: Date | null | undefined): string {
  if (!d) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Small SVG moon phase icon: lit fraction f, waxing = lit on the right. */
function MoonIcon({ f, waxing }: { f: number; waxing: boolean }) {
  const R = 10
  const rx = R * Math.abs(2 * f - 1)
  // Right semicircle, then elliptical terminator back up. sweep=1 bulges the
  // terminator left of center (more than half lit), sweep=0 bulges right.
  const d = `M 0 ${-R} A ${R} ${R} 0 0 1 0 ${R} A ${rx} ${R} 0 0 ${f >= 0.5 ? 1 : 0} 0 ${-R} Z`
  return (
    <svg width="24" height="24" viewBox="-12 -12 24 24" className="moon-icon">
      <circle r={R} fill="#3a4254" />
      <path d={d} fill="#dfe5f2" transform={waxing ? undefined : 'scale(-1 1)'} />
    </svg>
  )
}

function verdict(events: NightEvents, conditions: SkyConditions): string {
  const { moon } = conditions
  if (!events.darkStart) {
    return 'The sky never gets astronomically dark tonight — look for the brightest constellations.'
  }
  const brightMoon = moon.illumination >= 0.55
  if (brightMoon) {
    return `Bright ${moon.phaseName.toLowerCase()} tonight — moonlight will wash out faint stars, so stick to the bright constellations.`
  }
  if (moon.illumination <= 0.3) {
    return `Dark skies after ${fmtTime(events.darkStart)} — a great night for faint constellations.`
  }
  return `Decent viewing after ${fmtTime(events.darkStart)}; the ${moon.phaseName.toLowerCase()} moon interferes only a little.`
}

export default function SkyTonight({ events, conditions }: Props) {
  const { moon } = conditions
  const waxing = moon.phaseAngle < 180
  return (
    <section className="panel">
      <h2>Sky tonight</h2>
      <table className="events-table">
        <tbody>
          <tr>
            <td>Sunset</td>
            <td>
              {fmtTime(events.sunset?.time)}
              {events.sunset ? ` (${compassName(events.sunset.azDeg)})` : ''}
            </td>
          </tr>
          <tr>
            <td>Full darkness</td>
            <td>
              {fmtTime(events.darkStart)} – {fmtTime(events.darkEnd)}
            </td>
          </tr>
          <tr>
            <td>Sunrise</td>
            <td>
              {fmtTime(events.sunrise?.time)}
              {events.sunrise ? ` (${compassName(events.sunrise.azDeg)})` : ''}
            </td>
          </tr>
          <tr>
            <td>Moonrise</td>
            <td>
              {fmtTime(events.moonrise?.time)}
              {events.moonrise ? ` (${compassName(events.moonrise.azDeg)})` : ''}
            </td>
          </tr>
          <tr>
            <td>Moonset</td>
            <td>
              {fmtTime(events.moonset?.time)}
              {events.moonset ? ` (${compassName(events.moonset.azDeg)})` : ''}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="moon-row">
        <MoonIcon f={moon.illumination} waxing={waxing} />
        <span>
          {moon.phaseName} · {Math.round(moon.illumination * 100)}% lit
        </span>
      </div>
      <p className="hint">{verdict(events, conditions)}</p>
    </section>
  )
}
