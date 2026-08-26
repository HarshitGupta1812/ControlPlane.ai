import { Activity, BarChart3, BookOpenCheck, ChevronRight, CircleHelp, FileClock, GitBranch, ListChecks, LogOut, Menu, PanelLeftClose, Play, Settings2, Shield, SlidersHorizontal, Sparkles, Waypoints, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Brand } from './Brand'
import { StatusDot } from './Badge'
import { useAuth } from '../auth/context'
import { useState } from 'react'

const navItems = [
  { to: '/app', label: 'Playground', icon: Sparkles, end: true },
  { to: '/app/dashboard', label: 'Dashboard', icon: BarChart3 },
  { to: '/app/pipeline', label: 'Live Pipeline', icon: Waypoints },
  { to: '/app/replay', label: 'Replay', icon: Play },
  { to: '/app/policies', label: 'Policies', icon: ListChecks },
  { to: '/app/traces', label: 'Traces', icon: GitBranch },
  { to: '/app/review', label: 'Review queue', icon: BookOpenCheck, count: 3 },
]

export function Sidebar() {
  const { user, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  return <>
    <button className="mobile-menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
    {mobileOpen && <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'mobile-visible' : ''}`}>
      <div className="sidebar-top"><Brand /><button className="sidebar-close" onClick={() => setMobileOpen(false)}><X size={18} /></button><button className="sidebar-collapse" aria-label="Collapse sidebar"><PanelLeftClose size={16} /></button></div>
      <div className="workspace-switcher"><div className="workspace-avatar">N</div><div><strong>Northstar Labs</strong><small>Production workspace</small></div><ChevronRight size={14} /></div>
      <div className="sidebar-label">Workspace</div>
      <nav className="primary-nav">{navItems.map(({ to, label, icon: Icon, end, count }) => <NavLink key={to} to={to} end={end} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{count && <em>{count}</em>}</NavLink>)}</nav>
      <div className="sidebar-label sidebar-label-spaced">Manage</div>
      <nav className="primary-nav"><NavLink to="/app/settings" onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Settings2 size={17} strokeWidth={1.8} /><span>Settings</span></NavLink></nav>
      <div className="sidebar-spacer" />
      <div className="system-status"><StatusDot tone="safe" pulse /><div><strong>All systems operational</strong><small>API latency 42ms</small></div></div>
      <div className="sidebar-footer"><div className="user-avatar">MC</div><div className="user-meta"><strong>{user?.name ?? 'Maya Chen'}</strong><small>{user?.email ?? 'maya@northstar.ai'}</small></div><button onClick={signOut} aria-label="Sign out"><LogOut size={16} /></button></div>
    </aside>
  </>
}
