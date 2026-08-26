import type { ReactNode } from 'react'
import type { Severity } from '../lib/types'

const toneClass: Record<Severity, string> = { safe: 'badge-safe', info: 'badge-info', warn: 'badge-warn', danger: 'badge-danger' }

export function Badge({ children, tone = 'info', dot = true }: { children: ReactNode; tone?: Severity; dot?: boolean }) {
  return <span className={`badge ${toneClass[tone]}`}>{dot && <span className="badge-dot" />}{children}</span>
}

export function StatusDot({ tone = 'info', pulse = false }: { tone?: Severity; pulse?: boolean }) {
  return <span className={`status-dot status-${tone} ${pulse ? 'is-pulsing' : ''}`} />
}
