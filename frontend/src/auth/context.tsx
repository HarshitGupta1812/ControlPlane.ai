import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { User } from '../lib/types'
import { API_BASE, ApiError, apiFetch, isApiMode } from '../lib/api'

interface AuthContextValue {
  user: User | null
  signIn: (email: string, password?: string, mode?: 'signin' | 'signup', displayName?: string, workspaceName?: string) => Promise<void>
  signOut: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

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
    signIn: async (email: string, password = '', mode = 'signin', displayName?: string, workspaceName?: string) => {
      if (isApiMode()) {
        const path = mode === 'signup' ? '/api/auth/signup' : '/api/auth/signin'
        const payload = mode === 'signup'
          ? { email, password, display_name: displayName || email.split('@')[0], workspace_name: workspaceName || 'My workspace' }
          : { email, password }
        const result = await apiFetch<{ access_token: string; user: { id: string; email: string; display_name: string; tenant_id: string } }>(path, { method: 'POST', body: JSON.stringify(payload) })
        const next: User = { id: result.user.id, email: result.user.email, name: result.user.display_name, tenant_id: result.user.tenant_id }
        localStorage.setItem('cp_user', JSON.stringify(next))
        localStorage.setItem('cp_token', result.access_token)
        setUser(next)
        return
      }
      throw new Error('API is not available. Please ensure the backend is running.')
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
