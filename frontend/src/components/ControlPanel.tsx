import { useState } from 'react'

interface Props {
  lat: number
  lon: number
  date: Date
  onLocationChange: (lat: number, lon: number) => void
  onDateChange: (date: Date) => void
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function toDateInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function ControlPanel({ lat, lon, date, onLocationChange, onDateChange }: Props) {
  const [geoError, setGeoError] = useState<string | null>(null)
  const minutes = date.getHours() * 60 + date.getMinutes()

  const setDatePart = (value: string) => {
    const [y, m, d] = value.split('-').map(Number)
    if (!y || !m || !d) return
    const next = new Date(date)
    next.setFullYear(y, m - 1, d)
    onDateChange(next)
  }

  const setMinutes = (mins: number) => {
    const next = new Date(date)
    next.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
    onDateChange(next)
  }

  const useMyLocation = () => {
    setGeoError(null)
    if (!navigator.geolocation) {
      setGeoError('Geolocation not supported by this browser')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => onLocationChange(
        Math.round(pos.coords.latitude * 100) / 100,
        Math.round(pos.coords.longitude * 100) / 100,
      ),
      () => setGeoError('Could not get your location'),
    )
  }

  return (
    <section className="panel">
      <h2>Location &amp; Time</h2>
      <div className="field-row">
        <label>
          Latitude
          <input
            type="number"
            value={lat}
            min={-90}
            max={90}
            step={0.5}
            onChange={(e) => onLocationChange(Number(e.target.value), lon)}
          />
        </label>
        <label>
          Longitude
          <input
            type="number"
            value={lon}
            min={-180}
            max={180}
            step={0.5}
            onChange={(e) => onLocationChange(lat, Number(e.target.value))}
          />
        </label>
      </div>
      <button className="btn subtle" onClick={useMyLocation}>
        Use my location
      </button>
      {geoError && <p className="error">{geoError}</p>}

      <label className="stacked">
        Date
        <input type="date" value={toDateInput(date)} onChange={(e) => setDatePart(e.target.value)} />
      </label>

      <label className="stacked">
        Time — {pad(date.getHours())}:{pad(date.getMinutes())}
        <input
          type="range"
          min={0}
          max={1439}
          step={5}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
        />
      </label>

      <button className="btn subtle" onClick={() => onDateChange(new Date())}>
        Now
      </button>
    </section>
  )
}
