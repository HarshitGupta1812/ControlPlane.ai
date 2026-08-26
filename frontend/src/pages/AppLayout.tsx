import { Outlet, useLocation } from 'react-router-dom'
import { Bell, ChevronRight, Command, Search } from 'lucide-react'
import { Sidebar } from '../components/Sidebar'
import { NeedHelp } from '../components/NeedHelp'

const labels: Record<string, string> = { '/app': 'Playground', '/app/dashboard': 'Dashboard', '/app/pipeline': 'Live Pipeline', '/app/replay': 'Replay', '/app/policies': 'Policies', '/app/traces': 'Traces', '/app/review': 'Review queue', '/app/settings': 'Settings' }

export function AppLayout() {
  const location = useLocation()
  const label = labels[location.pathname] ?? 'Control plane'
  return <div className="app-shell"><Sidebar /><div className="app-main"><header className="app-topbar"><div className="breadcrumbs"><span>Northstar Labs</span><ChevronRight size={13} /><strong>{label}</strong></div><div className="topbar-actions"><button className="command-search"><Search size={15} /><span>Search anything</span><kbd>⌘ K</kbd></button><button className="topbar-icon"><Bell size={17} /><i /></button><div className="topbar-tenant"><span>MC</span></div></div></header><div className="page-content"><Outlet /></div></div><NeedHelp /></div>
}
