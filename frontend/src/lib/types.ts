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
}

export interface PolicyProfile {
  id: string
  name: string
  version: string
  useCase: string
  geography: string
  sector: string
  active: boolean
  updated: string
  ruleCount: number
}

export interface User {
  email: string
  name: string
  tenant: string
}
