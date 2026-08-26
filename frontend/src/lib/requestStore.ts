import { demoRequests, stageBlueprint } from './mockData'
import type { Action, RequestRecord, Severity, StageEvent, StageStatus } from './types'

const STORAGE_KEY = 'cp_recent_requests'

function storageKey() {
  try {
    const user = localStorage.getItem('cp_user')
    const email = user ? (JSON.parse(user) as { email?: string }).email : undefined
    return email ? `${STORAGE_KEY}:${encodeURIComponent(email)}` : STORAGE_KEY
  } catch {
    return STORAGE_KEY
  }
}

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const PHONE = /(?<!\w)(?:\+?\d[\d .()\-]{7,}\d)(?!\w)/g
const CARD = /\b(?:\d[ -]*?){13,19}\b/g
const STAGE_LABELS: Record<string, string> = { 'request.received': 'Request received', 'pii.scan': 'PII scan', 'injection.scan': 'Injection scan', 'complexity.classify': 'Complexity', 'usecase.detect': 'Use case detected', 'policy.evaluate': 'Policy evaluation', 'routing.select': 'Route selected', 'generation.stream': 'Streaming gate', verification: 'Verification', 'trust.calculated': 'Trust calculated' }

function sanitize(value: string) {
  return value.replace(EMAIL, '[EMAIL REDACTED]').replace(PHONE, '[PHONE REDACTED]').replace(CARD, '[PAYMENT CARD REDACTED]')
}

function sanitizeRequest(request: RequestRecord): RequestRecord {
  return { ...request, prompt: sanitize(request.prompt), response: request.response ? sanitize(request.response) : request.response }
}

export interface ApiEventRecord { sequence: number; stage: string; status: string; duration_ms: number; confidence: number | null; data: Record<string, unknown>; ts: string }
export interface ApiRequestRecord { id: string; prompt: string; use_case: string; action: string; trust_score: number; risk_tags: string[]; model_served: string | null; verification_verdict: string | null; latency_ms: number; cost_usd: number; status?: string; created_at: string }
export interface ApiRequestDetail extends ApiRequestRecord { events: ApiEventRecord[]; verification_claims?: Record<string, unknown>[] }

function displayUseCase(value: string) { return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') }
function severityFor(action: string): Severity { return action === 'BLOCK' ? 'danger' : ['FLAG', 'HUMAN_REVIEW'].includes(action) ? 'warn' : 'safe' }

export function stagesFromApiEvents(events: ApiEventRecord[]): StageEvent[] {
  return events.map((event) => {
    const status = (['queued', 'running', 'ok', 'warn', 'blocked'].includes(event.status) ? event.status : 'warn') as StageStatus
    const data = event.data ?? {}
    const tone: Severity = status === 'blocked' ? 'danger' : status === 'warn' ? 'warn' : status === 'ok' ? 'safe' : 'info'
    const detail = String(data.explanation ?? data.action ?? data.use_case ?? data.verdict ?? (status === 'blocked' ? 'Blocked by policy.' : 'Stage completed.'))
    return { id: event.stage, name: event.stage, label: STAGE_LABELS[event.stage] ?? event.stage, status, duration: `${event.duration_ms}ms`, confidence: event.confidence == null ? undefined : `${Math.round(event.confidence * 100)}%`, detail, tone }
  })
}

export function fromApiRequest(raw: ApiRequestRecord): RequestRecord {
  const action = raw.action as Action
  const tone = severityFor(raw.action)
  const stages: StageEvent[] = stageBlueprint.map((stage) => ({ ...stage, status: raw.status === 'blocked' ? 'blocked' : stage.status, tone: raw.status === 'blocked' ? 'danger' : stage.tone }))
  return { id: raw.id, prompt: raw.prompt, useCase: displayUseCase(raw.use_case), action, trust: raw.trust_score, createdAt: new Date(raw.created_at).toLocaleString(), model: raw.model_served ?? '—', latency: `${raw.latency_ms}ms`, cost: `$${raw.cost_usd.toFixed(4)}`, riskTags: raw.risk_tags ?? [], verdict: raw.verification_verdict ?? 'Unverified', tone, stages }
}

export function fromApiDetail(raw: ApiRequestDetail): RequestRecord {
  return { ...fromApiRequest(raw), stages: raw.events?.length ? stagesFromApiEvents(raw.events) : fromApiRequest(raw).stages }
}

export function loadRequests(includeDemo = true): RequestRecord[] {
  try {
    const stored = localStorage.getItem(storageKey())
    const local = stored ? JSON.parse(stored) as RequestRecord[] : []
    const ids = new Set(local.map((request) => request.id))
    return includeDemo ? [...local, ...demoRequests.filter((request) => !ids.has(request.id))] : local
  } catch {
    return includeDemo ? demoRequests : []
  }
}

export function saveRequest(request: RequestRecord) {
  try {
    const next = [sanitizeRequest(request), ...loadRequests().filter((item) => item.id !== request.id)].slice(0, 50)
    // Keep only user-generated records in storage; seeded demo traffic is supplied by the fallback layer.
    localStorage.setItem(storageKey(), JSON.stringify(next.filter((item) => !demoRequests.some((demo) => demo.id === item.id))))
  } catch { /* Storage is optional in private browsing. */ }
}
