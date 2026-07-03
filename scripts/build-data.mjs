#!/usr/bin/env node
/**
 * Generates the star and constellation datasets used by the frontend:
 *   data/stars.json               - bright stars from the HYG database (J2000 RA/Dec)
 *   data/constellation-lines.json - line figures for all 88 IAU constellations
 *
 * data/constellations.json (mythology, seasons, notable stars) is authored by
 * hand and NOT touched by this script.
 *
 * Sources are cached in scripts/cache/ so re-runs are offline-friendly.
 */
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, 'scripts', 'cache')
const OUT = join(ROOT, 'data')

const HYG_URL =
  'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv'
const SKYCULTURE_URL =
  'https://raw.githubusercontent.com/Stellarium/stellarium/master/skycultures/modern/index.json'

const MAG_LIMIT = 5.5

async function cachedFetch(url, filename) {
  const path = join(CACHE, filename)
  try {
    await access(path)
    return readFile(path, 'utf8')
  } catch {
    console.log(`Downloading ${url} ...`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
    const text = await res.text()
    await writeFile(path, text)
    return text
  }
}

/** Minimal CSV parser that handles double-quoted fields. */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

async function main() {
  await mkdir(CACHE, { recursive: true })
  await mkdir(OUT, { recursive: true })

  const [hygCsv, skycultureJson] = await Promise.all([
    cachedFetch(HYG_URL, 'hygdata_v41.csv'),
    cachedFetch(SKYCULTURE_URL, 'stellarium_modern.json'),
  ])

  // --- Constellation lines ---------------------------------------------
  const skyculture = JSON.parse(skycultureJson)
  const lineHips = new Set()
  const constellations = skyculture.constellations.map((c) => {
    // id looks like "CON modern Aql"
    const abbr = c.id.split(' ').pop()
    for (const seg of c.lines) for (const hip of seg) lineHips.add(hip)
    return {
      abbr,
      name: c.common_name?.native ?? abbr,
      english: c.common_name?.english ?? '',
      lines: c.lines,
    }
  })

  // --- Stars -------------------------------------------------------------
  const rows = parseCsv(hygCsv)
  const header = rows[0]
  const col = Object.fromEntries(header.map((name, i) => [name, i]))

  // hip -> star; when multiple catalog entries share a HIP number (binary
  // components), keep the brightest so line figures connect to real points.
  const byHip = new Map()
  const stars = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (r.length < header.length) continue
    const mag = parseFloat(r[col.mag])
    const hip = r[col.hip] ? parseInt(r[col.hip], 10) : null
    const dist = parseFloat(r[col.dist])
    if (dist === 0) continue // the Sun
    const wanted = mag <= MAG_LIMIT || (hip !== null && lineHips.has(hip))
    if (!wanted) continue
    const star = {
      hip,
      ra: +parseFloat(r[col.ra]).toFixed(6), // hours, J2000
      dec: +parseFloat(r[col.dec]).toFixed(5), // degrees, J2000
      mag: +mag.toFixed(2),
      ci: r[col.ci] ? +parseFloat(r[col.ci]).toFixed(3) : 0,
      name: r[col.proper] || null,
      con: r[col.con] || null,
    }
    if (hip !== null) {
      const existing = byHip.get(hip)
      if (existing) {
        if (star.mag < existing.mag) {
          Object.assign(existing, star)
        }
        continue
      }
      byHip.set(hip, star)
    }
    stars.push(star)
  }
  stars.sort((a, b) => a.mag - b.mag)

  const missing = [...lineHips].filter((h) => !byHip.has(h))
  if (missing.length) {
    console.warn(`Warning: ${missing.length} line stars not found in HYG:`, missing)
  }

  await writeFile(join(OUT, 'stars.json'), JSON.stringify(stars))
  await writeFile(
    join(OUT, 'constellation-lines.json'),
    JSON.stringify(constellations),
  )

  console.log(`Wrote ${stars.length} stars and ${constellations.length} constellations.`)
}

main()
