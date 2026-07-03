export interface Star {
  hip: number | null
  /** Right ascension in hours (J2000) */
  ra: number
  /** Declination in degrees (J2000) */
  dec: number
  mag: number
  /** B-V color index */
  ci: number
  name: string | null
  /** IAU constellation abbreviation */
  con: string | null
}

export interface ConstellationLines {
  abbr: string
  /** Latin name, e.g. "Orion" */
  name: string
  /** English translation, e.g. "Hunter" */
  english: string
  /** Polylines of HIP catalog numbers */
  lines: number[][]
}

export interface ConstellationMeta {
  abbr: string
  name: string
  meaning: string
  bestMonth: string
  mythology: string
  notableStars: string[]
  funFact: string
}

export interface User {
  id: number
  email: string
}

export interface QuizResult {
  score: number
  total: number
  created_at: string
}

export type Mode = 'explore' | 'tour' | 'quiz'
