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
  verification_verdict: string
  model_served: string
  created_at: string
}

export function fromApiRequest(apiReq: ApiRequestRecord): RequestRecord {
  const isBlocked = apiReq.action === 'BLOCK'
  const isReview = apiReq.action === 'HUMAN_REVIEW'
  const isFlagged = apiReq.action === 'FLAG'
  
  const tone = isBlocked ? 'danger' : isReview || isFlagged ? 'warn' : 'safe'
  const stages: StageEvent[] = stageBlueprint.map(stage => {
    let status = 'ok' as const
    let confidence = '100%'
    if (stage.id === 'routing.select') {
      return { ...stage, status, confidence, detail: `Routed to ${apiReq.model_served}` }
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
  
  return {
    id: apiReq.id,
    prompt: apiReq.prompt,
    useCase: apiReq.use_case,
    action: apiReq.action as Action,
    trust: apiReq.trust_score,
    createdAt: new Date(apiReq.created_at).toLocaleString(),
    model: apiReq.model_served,
    latency: `${apiReq.latency_ms}ms`,
    cost: `$${apiReq.cost_usd.toFixed(4)}`,
    riskTags: apiReq.risk_tags || [],
    verdict: apiReq.verification_verdict,
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
