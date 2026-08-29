import { ArrowUpRight, Check, ChevronDown, MoreHorizontal, Plus, RefreshCw, Search, SlidersHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Severity } from '../lib/types'
import { Badge, StatusDot } from './Badge'

export function PageHeader({ eyebrow, title, description, action, actionLabel, children }: { eyebrow?: string; title: string; description?: string; action?: () => void; actionLabel?: string; children?: ReactNode }) {
  return <div className="page-header"><div><div className="eyebrow">{eyebrow ?? 'Workspace'}</div><h1>{title}</h1>{description && <p>{description}</p>}</div><div className="page-header-actions">{children}{action && <button className="button button-crimson" onClick={action}>{actionLabel ?? 'New request'} <ArrowUpRight size={15} /></button>}</div></div>
}

export function SectionHeader({ title, detail, action, icon }: { title: string; detail?: string; action?: string; icon?: ReactNode }) { return <div className="section-header"><div><h2>{title}</h2>{detail && <span>{detail}</span>}</div>{action && <button className="subtle-button">{icon ?? <RefreshCw size={14} />} {action}</button>}</div> }

export function KpiCard({ label, value, delta, deltaTone = 'safe', detail, children }: { label: string; value: string; delta?: string; deltaTone?: Severity; detail?: string; children?: ReactNode }) { return <article className="kpi-card glass-panel"><div className="kpi-head"><span>{label}</span><button><MoreHorizontal size={16} /></button></div><div className="kpi-value-row"><strong>{value}</strong>{delta && <Badge tone={deltaTone}>{delta}</Badge>}</div>{detail && <small className="kpi-detail">{detail}</small>}{children}</article> }

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange?: (value: boolean) => void; label?: string }) { return <label className="toggle-control">{label && <span>{label}</span>}<button type="button" className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange?.(!checked)} aria-pressed={checked}><i /></button></label> }

export function SelectField({ value, onChange, options, label, dark = false }: { value: string; onChange: (value: string) => void; options: string[]; label?: string; dark?: boolean }) { return <label className={`select-field ${dark ? 'dark' : ''}`}>{label && <span>{label}</span>}<span className="select-wrap"><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={14} /></span></label> }

export function SearchField({ value, onChange, placeholder = 'Filter traces...' }: { value: string; onChange: (value: string) => void; placeholder?: string }) { return <label className="search-field"><Search size={15} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label> }

export function ActionBadge({ action }: { action: string }) { const map: Record<string, Severity> = { ALLOW: 'safe', EDIT: 'info', SANITIZE: 'info', FLAG: 'warn', HUMAN_REVIEW: 'warn', BLOCK: 'danger' }; return <Badge tone={map[action] ?? 'info'}>{action.replace('_', ' ')}</Badge> }
export function RiskBar({ value, color = 'crimson' }: { value: number; color?: string }) { return <div className="risk-bar"><i className={color} style={{ width: `${value}%` }} /></div> }
export function MiniSpark({ values, tone = 'crimson' }: { values: number[]; tone?: string }) { const max = Math.max(...values); const min = Math.min(...values); const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${34 - ((value - min) / Math.max(max - min, 1)) * 29}`).join(' '); return <svg className={`mini-spark spark-${tone}`} viewBox="0 0 100 36" preserveAspectRatio="none"><polyline points={points} fill="none" vectorEffect="non-scaling-stroke" /><polyline points={`0,36 ${points} 100,36`} className="spark-area" /></svg> }
export function EmptySearch({ query }: { query: string }) { return <div className="empty-state"><div className="empty-icon"><SlidersHorizontal size={19} /></div><h3>No matching events</h3><p>Nothing in this workspace matches “{query}”. Try a different filter.</p></div> }
export function AddButton({ children = 'Add new' }: { children?: ReactNode }) { return <button className="subtle-button"><Plus size={14} /> {children}</button> }
export function CheckMark() { return <span className="check-mark"><Check size={13} /></span> }
