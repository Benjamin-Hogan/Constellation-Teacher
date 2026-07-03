import type {
  ConstellationLines,
  ConstellationMeta,
  QuizResult,
  Star,
  User,
} from './types'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: options?.body ? { 'content-type': 'application/json' } : undefined,
    credentials: 'same-origin',
    ...options,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`)
  }
  return body as T
}

export const api = {
  loadData: () =>
    Promise.all([
      req<Star[]>('/api/data/stars.json'),
      req<ConstellationLines[]>('/api/data/constellation-lines.json'),
      req<ConstellationMeta[]>('/api/data/constellations.json'),
    ]),

  register: (email: string, password: string) =>
    req<User>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    req<User>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () => req<{ ok: true }>('/api/auth/logout', { method: 'POST' }),

  me: () => req<{ user: User | null }>('/api/auth/me'),

  getProgress: () => req<{ learned: string[] }>('/api/progress'),

  setProgress: (abbr: string, learned: boolean) =>
    req<{ ok: true }>(`/api/progress/${abbr}`, {
      method: 'PUT',
      body: JSON.stringify({ learned }),
    }),

  saveQuizResult: (score: number, total: number) =>
    req<{ ok: true }>('/api/quiz-results', {
      method: 'POST',
      body: JSON.stringify({ score, total }),
    }),

  getQuizResults: () => req<{ results: QuizResult[] }>('/api/quiz-results'),
}
