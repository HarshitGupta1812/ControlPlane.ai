import { BarChart3, BookOpenCheck, GitBranch, LogOut, Menu, Sparkles, Waypoints, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Brand } from './Brand'
import { useAuth } from '../auth/context'
import { useEffect, useState } from 'react'

const navItems = [
  { to: '/app', label: 'Playground', icon: Sparkles, end: true },
  { to: '/app/dashboard', label: 'Analytics', icon: BarChart3 },
  { to: '/app/pipeline-replay', label: 'Decision Replay', icon: Waypoints },
  { to: '/app/traces', label: 'Audit Log', icon: GitBranch },
  { to: '/app/review', label: 'Review Queue', icon: BookOpenCheck },
]

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function Sidebar() {
  const { user, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile menu on route change
  useEffect(() => {
    const handler = () => setMobileOpen(false)
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  const initials = user?.name ? userInitials(user.name) : user?.email?.slice(0, 2).toUpperCase() ?? '??'

  return <>
    <button className="mobile-menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
    {mobileOpen && <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'mobile-visible' : ''}`} aria-expanded={true}>
      <div className="sidebar-top">
        <Brand />
        <button className="sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button>
      </div>
      <nav className="primary-nav">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            aria-current={undefined}
          >
            {({ isActive }) => (
              <>
                <Icon size={17} strokeWidth={1.8} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-footer">
        <div className="user-avatar">{initials}</div>
        <div className="user-meta">
          <strong>{user?.name ?? 'User'}</strong>
          <small>{user?.email ?? ''}</small>
        </div>
        <button onClick={signOut} aria-label="Sign out"><LogOut size={16} /></button>
      </div>
    </aside>
  </>
}
