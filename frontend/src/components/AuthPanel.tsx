import { useState } from 'react'
import { api } from '../api'
import type { User } from '../types'

interface Props {
  user: User | null
  onUserChange: (user: User | null) => void
}

export default function AuthPanel({ user, onUserChange }: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) {
    return (
      <div className="auth">
        <span className="auth-email">{user.email}</span>
        <button
          className="btn subtle"
          onClick={async () => {
            await api.logout()
            onUserChange(null)
          }}
        >
          Log out
        </button>
      </div>
    )
  }

  if (!open) {
    return (
      <div className="auth">
        <button className="btn subtle" onClick={() => setOpen(true)}>
          Log in to save progress
        </button>
      </div>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const fn = mode === 'login' ? api.login : api.register
      const u = await fn(email, password)
      onUserChange(u)
      setOpen(false)
      setEmail('')
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="auth auth-form" onSubmit={submit}>
      <input
        type="email"
        placeholder="email"
        value={email}
        required
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="password"
        value={password}
        required
        minLength={6}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button className="btn primary" disabled={busy} type="submit">
        {mode === 'login' ? 'Log in' : 'Sign up'}
      </button>
      <button
        type="button"
        className="btn subtle"
        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
      >
        {mode === 'login' ? 'Need an account?' : 'Have an account?'}
      </button>
      <button type="button" className="btn subtle" onClick={() => setOpen(false)}>
        ✕
      </button>
      {error && <span className="error">{error}</span>}
    </form>
  )
}
