import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { User } from '../lib/types'
import { API_BASE, ApiError, apiFetch, isApiMode } from '../lib/api'

interface AuthContextValue {
  user: User | null
  signIn: (email: string, password?: string, mode?: 'signin' | 'signup') => Promise<void>
  signOut: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const defaultUser: User = { email: 'maya@northstar.ai', name: 'Maya Chen', tenant: 'Northstar Labs' }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('cp_user')
      return stored ? JSON.parse(stored) as User : null
    } catch { return null }
  })

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isAuthenticated: Boolean(user),
    signIn: async (email: string, password = '', mode = 'signin') => {
      if (isApiMode()) {
        try {
          const path = mode === 'signup' ? '/api/auth/signup' : '/api/auth/signin'
          const payload = mode === 'signup' ? { email, password, display_name: email.split('@')[0], workspace_name: 'Northstar Labs' } : { email, password }
          const result = await apiFetch<{ access_token: string; user: { email: string; display_name: string; tenant_id: string } }>(path, { method: 'POST', body: JSON.stringify(payload) })
          const next: User = { email: result.user.email, name: result.user.display_name, tenant: 'Northstar Labs' }
          localStorage.setItem('cp_user', JSON.stringify(next))
          localStorage.setItem('cp_token', result.access_token)
          setUser(next)
          return
        } catch (error) {
          // Vite-only development intentionally falls back to the offline workspace.
          // Once an API is configured, surface credential errors instead of masking them.
          if (API_BASE || (error instanceof ApiError && error.status < 500)) throw error
        }
      }
      const next = { ...defaultUser, email: email || defaultUser.email }
      localStorage.setItem('cp_user', JSON.stringify(next))
      localStorage.setItem('cp_token', 'demo-session-token')
      setUser(next)
    },
    signOut: () => {
      localStorage.removeItem('cp_user')
      localStorage.removeItem('cp_token')
      setUser(null)
    },
  }), [user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
