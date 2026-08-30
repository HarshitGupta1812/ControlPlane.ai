import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Maximize2, Paperclip, RotateCcw, Send, Shield, SlidersHorizontal, Sparkles, WandSparkles, X } from 'lucide-react'
import { Badge, StatusDot } from '../components/Badge'
import { PipelinePanel } from '../components/PipelinePanel'
import { SelectField } from '../components/Ui'
import { stageBlueprint } from '../lib/mockData'
import { hasLiveApiToken, streamApi } from '../lib/api'
import { saveRequest } from '../lib/requestStore'
import type { Action, RequestRecord, StageEvent } from '../lib/types'

const defaultPrompt = 'Summarize our latest customer feedback themes and recommend three actions for the operations team.'
const stageLabels: Record<string, string> = { 'request.received': 'Request received', 'pii.scan': 'PII scan', 'injection.scan': 'Injection scan', 'complexity.classify': 'Complexity', 'usecase.detect': 'Use case detected', 'policy.evaluate': 'Policy evaluation', 'routing.select': 'Route selected', 'generation.stream': 'Streaming gate', verification: 'Verification', 'trust.calculated': 'Trust calculated' }

export function Playground() {
  const [prompt, setPrompt] = useState(() => sessionStorage.getItem('cp_last_prompt') || defaultPrompt)
  
  useEffect(() => {
    sessionStorage.setItem('cp_last_prompt', prompt)
  }, [prompt])
  const [paramsOpen, setParamsOpen] = useState(() => localStorage.getItem('cp_params_open') !== 'false')
  const [useCase, setUseCase] = useState('Auto-detect')
  const [policy, setPolicy] = useState('Auto · active profile')
  const [route, setRoute] = useState('Auto · best fit')
  const [privacy, setPrivacy] = useState('Sanitize')
  const [strictness, setStrictness] = useState('Medium')
  const [verification, setVerification] = useState('Auto')
  const [maxCost, setMaxCost] = useState('No limit')
  const [sourceAttached, setSourceAttached] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [active, setActive] = useState<RequestRecord | null>(null)
  const [runVersion, setRunVersion] = useState(0)
  const [error, setError] = useState('')
  const liveApi = hasLiveApiToken()
  const sessionId = useRef<string | undefined>(undefined)

  useEffect(() => { localStorage.setItem('cp_params_open', String(paramsOpen)) }, [paramsOpen])
  const displayedStages = useMemo(() => active?.stages ?? stageBlueprint, [active])

  async function runPrompt() {
    if (!prompt.trim() || isRunning) return
    setIsRunning(true)
    setHasRun(true)
    setError('')
    
    // Initialize a new request structure
    const initialRequest: RequestRecord = {
      id: `req_${Date.now().toString(16)}`, prompt, useCase: 'Auto-detect', action: 'ALLOW', trust: 0, createdAt: 'just now', model: '—', latency: '—', cost: '$0.0000', riskTags: [], verdict: 'Unverified', tone: 'info', stages: stageBlueprint.map((stage) => ({ ...stage, status: 'queued' as const })), response: ''
    }
    setActive(initialRequest)

    if (hasLiveApiToken()) {
      try {
        let stageEvents: StageEvent[] = stageBlueprint.map((stage) => ({ ...stage, status: 'queued' as const }))
        let requestId = initialRequest.id
        let responseText = ''
        let action = 'ALLOW' as Action
        let trust = 0
        let model = '—'
        let latency = '—'
        let cost = '$0.0000'
        let riskTags: string[] = []
        let verdict = 'Unverified'
        let detectedUseCase = 'Internal Knowledge'
        
        await streamApi('/api/chat/stream', { prompt, use_case: useCase === 'Auto-detect' ? undefined : useCase, policy_key: policy.startsWith('Auto') ? undefined : policy.split(' · ')[0], routing_preference: route.startsWith('Fast') ? 'fast' : route.startsWith('Capable') ? 'capable' : 'auto', pii_action: privacy.toLowerCase(), safety_strictness: strictness.toLowerCase(), verification: verification.toLowerCase(), max_cost_usd: maxCost === 'No limit' ? undefined : Number(maxCost.replace('$', '')), session_id: sessionId.current, sources: sourceAttached ? [{ id: 'internal-knowledge-demo', text: 'Customer feedback operations onboarding themes and runbook guidance.' }] : [] }, (event) => {
          if (event.data.request_id) requestId = String(event.data.request_id)
          if (event.event === 'context' && event.data.session_id) sessionId.current = String(event.data.session_id)
          if (event.event === 'token') responseText += String(event.data.text ?? '')
          if (event.event === 'post') { trust = Number(event.data.trust_score ?? trust); riskTags = Array.isArray(event.data.risk_tags) ? event.data.risk_tags.map(String) : riskTags; verdict = String(event.data.verification ?? verdict) }
          if (event.event === 'done') { action = String(event.data.action ?? action) as Action; trust = Number(event.data.trust_score ?? trust); model = event.data.model ? String(event.data.model) : '—'; latency = `${Number(event.data.latency_ms ?? 0)}ms`; cost = `$${Number(event.data.cost_usd ?? 0).toFixed(4)}` }
          if (event.event !== 'stage') return
          const name = String(event.data.stage ?? '')
          const stageData = (event.data.data ?? {}) as Record<string, unknown>
          const status = (['queued', 'running', 'ok', 'warn', 'blocked'].includes(String(event.data.status)) ? String(event.data.status) : 'warn') as StageEvent['status']
          const tone = status === 'blocked' ? 'danger' : status === 'warn' ? 'warn' : status === 'ok' ? 'safe' : 'info'
          const detail = String(stageData.explanation ?? stageData.action ?? stageData.use_case ?? stageData.verdict ?? (status === 'blocked' ? 'Blocked by policy.' : 'Stage completed.'))
          if (name === 'usecase.detect' && stageData.use_case) detectedUseCase = String(stageData.use_case)
          const nextStage: StageEvent = { id: name, name, label: stageLabels[name] ?? name, status, duration: `${Number(event.data.duration_ms ?? 0)}ms`, confidence: event.data.confidence == null ? undefined : `${Math.round(Number(event.data.confidence) * 100)}%`, detail, tone, rawData: event.data }
          stageEvents = [...stageEvents.filter((stage) => stage.id !== name), nextStage].sort((a, b) => stageBlueprint.findIndex((stage) => stage.id === a.id) - stageBlueprint.findIndex((stage) => stage.id === b.id))
          setActive((current) => current ? ({ ...current, stages: stageEvents }) : null)
        })
        const remoteRequest: RequestRecord = { id: requestId, prompt, useCase: detectedUseCase, action, trust, createdAt: 'just now', model, latency, cost, riskTags, verdict, tone: action === 'BLOCK' ? 'danger' : action === 'HUMAN_REVIEW' || action === 'FLAG' ? 'warn' : 'safe', stages: stageEvents, response: responseText.trim() }
        saveRequest(remoteRequest)
        setActive(remoteRequest)
        setRunVersion((value) => value + 1)
        setIsRunning(false)
        return
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Connection failed. Please ensure the backend is running.')
        setIsRunning(false)
      }
    } else {
      setError('Live API is not connected. Please log in with a valid token.')
      setIsRunning(false)
    }
  }

  return <div className="playground-page"><div className="playground-head"><div><h1>Test a governed prompt</h1><p>Submit an inference and watch the control plane decide in real time.</p></div></div><div className="playground-layout"><div className="playground-center"><section className="composer-card glass-panel"><div className="composer-toolbar"><div className="composer-route"><span className="model-orb"><Sparkles size={14} /></span><div><strong>Governed chat</strong><small>Policy-aware inference</small></div></div><div className="composer-toolbar-actions"><input type="file" id="file-upload" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files?.[0]; if (file) { if (file.size > 5 * 1024 * 1024) { alert('File size limit is 5MB'); return; } setSourceAttached(true); } }} /><button title="Attach source" className={sourceAttached ? 'toolbar-active' : ''} onClick={() => document.getElementById('file-upload')?.click()}><Paperclip size={16} /></button></div></div><textarea id="playground-composer" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask the control plane anything..." maxLength={12000} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void runPrompt() }} /><div className="composer-bottom">{sourceAttached ? <span className="source-chip"><Paperclip size={11} /> Source attached</span> : <span />}<div><span className="shortcut">⌘ ↵</span><button className="button button-crimson run-button" onClick={() => void runPrompt()} disabled={isRunning || !prompt.trim()}>{isRunning ? <><span className="button-spinner" /> Governing...</> : <>Run request</>}</button></div></div></section>{error && <div className="error-message" style={{ color: 'var(--danger)', marginTop: '10px', padding: '10px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>{error}</div>}{hasRun && active && !error && <ResponseCard request={active} running={isRunning} />}</div><aside className="playground-side"><section className={`parameters-card glass-panel ${paramsOpen ? 'open' : 'closed'}`}><button className="parameters-head" onClick={() => setParamsOpen((value) => !value)}><div><div className="eyebrow"><SlidersHorizontal size={12} /> Per-request parameters</div><h3>{paramsOpen ? 'Control how this run behaves' : 'Parameters hidden'}</h3></div><span className="params-toggle">{paramsOpen ? <ChevronDown size={16} /> : <ChevronLeft size={16} />}</span></button>{paramsOpen && <div className="parameters-body"><SelectField label="Use case" value={useCase} onChange={setUseCase} options={['Auto-detect', 'Customer Support', 'Internal Knowledge', 'Decision Support']} /><SelectField label="Policy profile" value={policy} onChange={setPolicy} options={['Auto · active profile', 'CP-CS-14 · Customer Support', 'CP-IK-07 · Internal Knowledge', 'CP-DS-11 · Decision Support']} /><SelectField label="Routing preference" value={route} onChange={setRoute} options={['Auto · best fit', 'Fast · lowest latency', 'Capable · highest quality']} /><div className="param-divider" /><div className="param-title"><span>Safety controls</span><small>Apply before generation</small></div><SelectField label="PII action" value={privacy} onChange={setPrivacy} options={['Sanitize', 'Flag', 'Block']} /><SelectField label="Safety strictness" value={strictness} onChange={setStrictness} options={['Low', 'Medium', 'High']} /><SelectField label="Verification" value={verification} onChange={setVerification} options={['Auto', 'On', 'Off']} /><SelectField label="Max cost / request" value={maxCost} onChange={setMaxCost} options={['No limit', '$0.005', '$0.01', '$0.05']} /></div>}</section></aside></div></div>
}

function ResponseCard({ request, running }: { request: RequestRecord; running: boolean }) {
  const [traceOpen, setTraceOpen] = useState(false)
  const blockSignals = request.riskTags.join(' + ') || 'a policy threshold'
  return <section className={`response-card glass-panel ${request.tone} ${running ? 'response-running' : ''}`}><div className="response-head"><div className="response-agent"><span className="agent-avatar"><Shield size={15} /></span><div><strong>ControlPlane response</strong><small>{request.useCase} · {request.createdAt}</small></div></div><div className="response-actions"><button title="Copy response" onClick={() => navigator.clipboard.writeText(request.response ?? '')}><Copy size={15} /></button></div></div>{running ? <div className="typing-response"><span /><span /><span /><small>Running governance stages…</small></div> : request.action === 'BLOCK' ? <div className="blocked-response"><div className="blocked-icon"><X size={19} /></div><div><h3>Request blocked before generation</h3><p>This prompt matched <b>{blockSignals}</b>. The active policy prevented model generation, so no unsafe output was released.</p><div className="risk-chips">{request.riskTags.map((tag) => <Badge key={tag} tone={tag === 'privacy' || tag === 'injection' ? 'danger' : 'warn'}>{tag}</Badge>)}</div></div></div> : request.action === 'HUMAN_REVIEW' ? <div className="blocked-response review-response"><div className="blocked-icon"><Shield size={19} /></div><div><h3>Held for human review</h3><p>The policy requires a reviewer due to overlapping risk signals. No recommendation was generated.</p><div className="risk-chips">{request.riskTags.map((tag) => <Badge key={tag} tone="warn">{tag}</Badge>)}</div></div></div> : null}<div className="response-metadata"><Meta label="Trust" value={`${request.trust}/100`} tone={request.trust > 80 ? 'safe' : request.trust > 50 ? 'warn' : 'danger'} prominent /><Meta label="Safety" value={request.action === 'BLOCK' ? 'Blocked' : request.action === 'HUMAN_REVIEW' ? 'Review' : '98%'} tone={request.action === 'BLOCK' ? 'danger' : request.action === 'HUMAN_REVIEW' ? 'warn' : 'safe'} /><Meta label="Privacy" value={request.riskTags.includes('privacy') ? 'Sanitized' : '100%'} tone={request.riskTags.includes('privacy') ? 'warn' : 'safe'} /><Meta label="Accuracy" value={request.verdict === 'Supported' ? '96%' : request.verdict === 'PARTIALLY_SUPPORTED' ? '61%' : request.action === 'ALLOW' ? '72%' : '—'} tone={request.verdict === 'Supported' ? 'safe' : request.verdict === 'PARTIALLY_SUPPORTED' || request.action === 'ALLOW' ? 'warn' : 'info'} /><div className="meta-separator" /><Meta label="Verdict" value={request.verdict} tone={request.tone} /><Meta label="Model" value={request.model} tone="info" /><Meta label="Latency" value={request.latency} tone="info" /><Meta label="Cost" value={request.cost} tone="info" /></div><div className="message-trace"><button className="trace-label trace-toggle" onClick={() => setTraceOpen((value) => !value)}><span><ActivityIcon /> Stage trace</span><span>{request.stages.filter((stage) => stage.status !== 'queued').length} / 10 events {traceOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span></button><div className="trace-mini">{request.stages.map((stage) => <i key={stage.id} className={`mini-event ${stage.status}`} title={stage.label} />)}</div>{traceOpen && <div className="trace-expanded">{request.stages.map((stage) => <div key={stage.id}><span className={`trace-state ${stage.status}`} /> <b>{stage.label}</b><small>{stage.detail}</small></div>)}</div>}</div></section>
}

function Meta({ label, value, tone, prominent = false }: { label: string; value: string; tone: 'safe' | 'warn' | 'danger' | 'info'; prominent?: boolean }) { return <div className={`meta-cell ${prominent ? 'prominent' : ''}`}><span>{label}</span><b className={`meta-${tone}`}>{value}</b></div> }
function ActivityIcon() { return <span className="trace-activity-icon"><span /><span /><span /></span> }
