import { stageBlueprint } from './mockData'
import type { RequestRecord, StageEvent, Action } from './types'

export interface ApiRequestRecord {
  id: string
  prompt: string
  use_case: string
  action: string
  policy_key: string
  trust_score: number
  cost_usd: number
  latency_ms: number
  risk_tags: string[]
  verification_verdict: string | null
  model_served: string | null
  created_at: string
}

export function fromApiRequest(apiReq: ApiRequestRecord & { events?: any[] }): RequestRecord {
  const isBlocked = apiReq.action === 'BLOCK'
  const isReview = apiReq.action === 'HUMAN_REVIEW'
  const isFlagged = apiReq.action === 'FLAG'
  
  const tone = isBlocked ? 'danger' : isReview || isFlagged ? 'warn' : 'safe'
  
  let stages: StageEvent[] = []
  if (apiReq.events && apiReq.events.length > 0) {
    stages = apiReq.events.map(ev => ({
      id: ev.stage,
      name: ev.stage,
      label: stageBlueprint.find(s => s.id === ev.stage)?.label || ev.stage,
      status: ev.status,
      duration: ev.duration_ms != null ? `${ev.duration_ms}ms` : undefined,
      confidence: ev.confidence != null ? `${Math.round(ev.confidence * 100)}%` : undefined,
      detail: ev.data?.detail || ev.data?.explanation || ev.data?.action || ev.data?.verdict || (ev.status === 'blocked' ? 'Blocked by policy.' : 'Stage completed.'),
      tone: ev.status === 'blocked' ? 'danger' : ev.status === 'warn' ? 'warn' : ev.status === 'ok' ? 'safe' : 'info',
      rawData: {
        stage: ev.stage,
        status: ev.status,
        duration_ms: ev.duration_ms ?? 0,
        confidence: ev.confidence != null ? `${Math.round(ev.confidence * 100)}%` : '100%',
        redacted: ev.stage === 'pii.scan' ? !!(ev.data && ev.data.redacted) : false,
        request_id: apiReq.id,
        ...(typeof ev.data === 'object' && ev.data !== null ? ev.data : {})
      }
    }))
  } else {
    stages = stageBlueprint.map(stage => {
      let status = 'ok' as const
      let confidence = '100%'
      if (stage.id === 'routing.select') {
        return { ...stage, status, confidence, detail: apiReq.model_served ? `Routed to ${apiReq.model_served}` : 'No model — request halted before generation' }
      }
      if (stage.id === 'trust.calculated') {
        return { ...stage, status: apiReq.trust_score > 80 ? 'ok' : apiReq.trust_score > 50 ? 'warn' : 'blocked', confidence: `${apiReq.trust_score}%`, detail: `Final trust score: ${apiReq.trust_score}` }
      }
      if (isBlocked && stage.id === 'policy.evaluate') {
        return { ...stage, status: 'blocked', detail: `Policy ${apiReq.policy_key} blocked request.` }
      }
      if (isBlocked && (stage.id === 'generation.stream' || stage.id === 'verification')) {
        return { ...stage, status: 'queued', detail: 'Skipped due to early termination.' }
      }
      return { ...stage, status, confidence }
    })
  }
  
  return {
    id: apiReq.id,
    prompt: apiReq.prompt,
    useCase: apiReq.use_case,
    action: apiReq.action as Action,
    trust: apiReq.trust_score,
    createdAt: new Date(apiReq.created_at).toLocaleString(),
    model: apiReq.model_served ?? '—',
    latency: `${apiReq.latency_ms}ms`,
    cost: `$${apiReq.cost_usd.toFixed(4)}`,
    riskTags: apiReq.risk_tags || [],
    verdict: apiReq.verification_verdict ?? 'UNVERIFIED',
    tone,
    stages
  }
}

export function loadRequests(includeDemo: boolean = false): RequestRecord[] {
  try {
    const raw = localStorage.getItem('cp_requests')
    if (raw) {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    }
  } catch (e) {
    console.error('Failed to load local requests', e)
  }
  return []
}

export function saveRequest(request: RequestRecord) {
  try {
    const existing = loadRequests()
    const updated = [request, ...existing].slice(0, 50)
    localStorage.setItem('cp_requests', JSON.stringify(updated))
    window.dispatchEvent(new Event('cp_requests_updated'))
  } catch (e) {
    console.error('Failed to save request', e)
  }
}

export function resolveLocalRequest(id: string, action: 'ALLOW' | 'BLOCK') {
  try {
    const existing = loadRequests()
    const updated = existing.map(r => {
      if (r.id === id) {
        return { ...r, action, tone: action === 'BLOCK' ? 'danger' : 'safe' }
      }
      return r
    })
    localStorage.setItem('cp_requests', JSON.stringify(updated))
    window.dispatchEvent(new Event('cp_requests_updated'))
  } catch (e) {
    console.error('Failed to resolve request locally', e)
  }
}
