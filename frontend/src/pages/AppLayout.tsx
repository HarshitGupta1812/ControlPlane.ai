import { Outlet, useLocation } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { Sidebar } from '../components/Sidebar'
import { useAuth } from '../auth/context'

const labels: Record<string, string> = {
  '/app': 'Playground',
  '/app/dashboard': 'Analytics',
  '/app/pipeline-replay': 'Decision Replay',
  '/app/traces': 'Audit Log',
  '/app/review': 'Review Queue',
}

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function AppLayout() {
  const location = useLocation()
  const { user, signOut } = useAuth()
  const label = labels[location.pathname] ?? 'Control Plane'
  const initials = user?.name ? userInitials(user.name) : user?.email?.slice(0, 2).toUpperCase() ?? '??'

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <header className="app-topbar">
          <div className="breadcrumbs">
            <strong>{label}</strong>
          </div>
          <div className="topbar-actions">
            <div className="topbar-user">
              <div className="topbar-tenant"><span>{initials}</span></div>
              <span className="topbar-name">{user?.name ?? 'User'}</span>
              <button className="topbar-signout" onClick={signOut} aria-label="Sign out" title="Sign out">
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </header>
        <div className="page-content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
