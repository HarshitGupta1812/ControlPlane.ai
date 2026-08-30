export type Severity = 'safe' | 'info' | 'warn' | 'danger'
export type Action = 'ALLOW' | 'EDIT' | 'SANITIZE' | 'FLAG' | 'HUMAN_REVIEW' | 'BLOCK'

export type StageStatus = 'queued' | 'running' | 'ok' | 'warn' | 'blocked'

export interface StageEvent {
  id: string
  name: string
  label: string
  status: StageStatus
  duration?: string
  confidence?: string
  detail: string
  tone: Severity
  rawData?: any
}

export interface RequestRecord {
  id: string
  prompt: string
  useCase: string
  action: Action
  trust: number
  createdAt: string
  model: string
  latency: string
  cost: string
  riskTags: string[]
  verdict: string
  tone: Severity
  stages: StageEvent[]
  response?: string
  policyKey?: string
  policyVersion?: number
}

export interface User {
  id: string
  email: string
  name: string
  tenant_id: string
}
