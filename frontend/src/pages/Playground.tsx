import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Code2, Copy, Info, Maximize2, Paperclip, RotateCcw, Send, Shield, SlidersHorizontal, Sparkles, WandSparkles, X } from 'lucide-react'
import { Badge, StatusDot } from '../components/Badge'
import { PipelinePanel } from '../components/PipelinePanel'
import { SelectField } from '../components/Ui'
import { demoRequests, playgroundPrompts, stageBlueprint } from '../lib/mockData'
import { hasLiveApiToken, streamApi } from '../lib/api'
import { saveRequest } from '../lib/requestStore'
import type { Action, RequestRecord, StageEvent } from '../lib/types'

const defaultPrompt = 'Summarize our latest customer feedback themes and recommend three actions for the operations team.'
const stageLabels: Record<string, string> = { 'request.received': 'Request received', 'pii.scan': 'PII scan', 'injection.scan': 'Injection scan', 'complexity.classify': 'Complexity', 'usecase.detect': 'Use case detected', 'policy.evaluate': 'Policy evaluation', 'routing.select': 'Route selected', 'generation.stream': 'Streaming gate', verification: 'Verification', 'trust.calculated': 'Trust calculated' }

function buildResult(prompt: string, piiAction = 'Sanitize', sourceAttached = false, requestedUseCase = 'Auto-detect', routingPreference = 'Auto · best fit', verificationMode = 'Auto', maxCost = 'No limit'): { request: RequestRecord; stages: StageEvent[] } {
  const lower = prompt.toLowerCase()
  const fused = (lower.includes('ignore') || lower.includes('previous safety')) && (lower.includes('email') || lower.includes('customer') || lower.includes('list'))
  const decision = requestedUseCase === 'Decision Support' || lower.includes('approve') || lower.includes('candidate') || lower.includes('applicant')
  const pii = lower.includes('@') || lower.includes('phone') || lower.includes('social security')
  const baseAction: Action = pii && piiAction === 'Block' ? 'BLOCK' : pii && piiAction === 'Flag' ? 'FLAG' : pii ? 'SANITIZE' : 'ALLOW'
  let action: Action = fused ? 'BLOCK' : decision && !sourceAttached && verificationMode !== 'Off' ? 'HUMAN_REVIEW' : !sourceAttached && baseAction === 'ALLOW' && verificationMode !== 'Off' ? 'FLAG' : baseAction
  const estimatedCost = routingPreference.startsWith('Capable') ? 0.0148 : 0.0022
  if (maxCost !== 'No limit' && estimatedCost > Number(maxCost.replace('$', '')) && action !== 'BLOCK' && action !== 'HUMAN_REVIEW') action = 'FLAG'
  const trust = fused ? 12 : decision ? 42 : action === 'FLAG' ? 68 : pii ? 76 : 91
  const useCase = requestedUseCase === 'Auto-detect' ? (decision ? 'Decision Support' : lower.includes('customer') ? 'Customer Support' : 'Internal Knowledge') : requestedUseCase
  const stages = stageBlueprint.map((stage, index) => ({ ...stage, status: action === 'BLOCK' && index > 3 ? 'blocked' as const : (action === 'HUMAN_REVIEW' || action === 'FLAG') && index === 5 ? 'warn' as const : stage.status, tone: action === 'BLOCK' && index > 3 ? 'danger' as const : (action === 'HUMAN_REVIEW' || action === 'FLAG') && index === 5 ? 'warn' as const : stage.tone, detail: index === 4 ? `${useCase} · explicit + semantic match.` : index === 5 && action === 'BLOCK' ? 'Injection + privacy fusion escalated to block.' : index === 5 && action === 'HUMAN_REVIEW' ? 'Bias + decision fusion requires a reviewer.' : index === 5 && action === 'FLAG' ? 'PII found; generation is flagged for verification.' : stage.detail }))
  const response = action === 'BLOCK' ? '' : action === 'HUMAN_REVIEW' ? 'This request has been held for human review because it asks for a consequential decision using sensitive proxy attributes. ControlPlane has not generated a recommendation.' : action === 'FLAG' ? 'The request was generated with a verification flag. Review the source coverage before relying on this answer.' : action === 'SANITIZE' ? 'I can help with the request after removing direct identifiers. The sanitized context keeps the operational intent while protecting personal data.' : 'Customer feedback clusters around onboarding friction, handoff latency, and search relevance. Recommended actions: tighten the first-run checklist, add an escalation SLA, and refresh high-traffic knowledge articles.'
  const verdict = action === 'BLOCK' ? 'Blocked by fused risk' : action === 'HUMAN_REVIEW' ? 'Review required' : action === 'FLAG' ? 'Flagged for verification' : action === 'SANITIZE' ? 'Sanitized and allowed' : sourceAttached ? 'Supported' : 'Unverifiable'
  const tone = action === 'BLOCK' ? 'danger' : action === 'HUMAN_REVIEW' || action === 'FLAG' ? 'warn' : 'safe'
  const request: RequestRecord = { id: `req_${Math.random().toString(16).slice(2, 8)}`, prompt, useCase, action, trust, createdAt: 'just now', model: action === 'BLOCK' || action === 'HUMAN_REVIEW' ? '—' : routingPreference.startsWith('Capable') ? 'gemini / 2.5-flash' : 'groq / gpt-oss-20b', latency: action === 'BLOCK' ? '82ms' : routingPreference.startsWith('Capable') ? '4.91s' : '1.42s', cost: action === 'BLOCK' || action === 'HUMAN_REVIEW' ? '$0.0000' : `$${estimatedCost.toFixed(4)}`,  riskTags: fused ? ['privacy', 'injection', 'exfiltration'] : decision ? ['bias', 'decision'] : pii ? ['privacy'] : [], verdict, tone, stages, response }
  return { request, stages }
}

export function Playground() {
  const [prompt, setPrompt] = useState(defaultPrompt)
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
  const [active, setActive] = useState<RequestRecord>(() => demoRequests[0])
  const [runVersion, setRunVersion] = useState(0)
  const liveApi = hasLiveApiToken()
  const sessionId = useRef<string | undefined>(undefined)

  useEffect(() => { localStorage.setItem('cp_params_open', String(paramsOpen)) }, [paramsOpen])
  const displayedStages = useMemo(() => active.stages, [active])

  async function runPrompt() {
    if (!prompt.trim() || isRunning) return
    setIsRunning(true)
    setHasRun(true)
    setActive((current) => ({ ...current, stages: current.stages.map((stage) => ({ ...stage, status: 'queued' as const })) }))

    if (hasLiveApiToken()) {
      try {
        let stageEvents: StageEvent[] = stageBlueprint.map((stage) => ({ ...stage, status: 'queued' as const }))
        let requestId = `req_${Date.now().toString(16)}`
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
          const nextStage: StageEvent = { id: name, name, label: stageLabels[name] ?? name, status, duration: `${Number(event.data.duration_ms ?? 0)}ms`, confidence: event.data.confidence == null ? undefined : `${Math.round(Number(event.data.confidence) * 100)}%`, detail, tone }
          stageEvents = [...stageEvents.filter((stage) => stage.id !== name), nextStage].sort((a, b) => stageBlueprint.findIndex((stage) => stage.id === a.id) - stageBlueprint.findIndex((stage) => stage.id === b.id))
          setActive((current) => ({ ...current, stages: stageEvents }))
        })
        const remoteRequest: RequestRecord = { id: requestId, prompt, useCase: detectedUseCase, action, trust, createdAt: 'just now', model, latency, cost, riskTags, verdict, tone: action === 'BLOCK' ? 'danger' : action === 'HUMAN_REVIEW' || action === 'FLAG' ? 'warn' : 'safe', stages: stageEvents, response: responseText.trim() }
        saveRequest(remoteRequest)
        setActive(remoteRequest)
        setRunVersion((value) => value + 1)
        setIsRunning(false)
        return
      } catch {
        // If a configured API is temporarily unavailable, keep the local deterministic demo usable.
      }
    }

    const next = buildResult(prompt, privacy, sourceAttached, useCase, route, verification, maxCost)
    window.setTimeout(() => { saveRequest(next.request); setActive(next.request); setRunVersion((value) => value + 1) }, 450)
    window.setTimeout(() => setIsRunning(false), 2450)
  }

  function loadPrompt(value: string) { setPrompt(value); window.setTimeout(() => document.getElementById('playground-composer')?.focus(), 0) }

  return <div className="playground-page"><div className="playground-head"><div><div className="eyebrow">Workspace / Playground</div><h1>Test a governed prompt</h1><p>Submit an inference and watch the control plane decide in real time.</p></div><div className="playground-head-status"><StatusDot tone="safe" pulse /> <span>{liveApi ? 'API gateway online' : 'Mock gateway online'}</span><small>{liveApi ? 'LIVE_API' : 'DEV_MOCK_LLM'}</small></div></div><div className="playground-layout"><div className="playground-center"><section className="composer-card glass-panel"><div className="composer-toolbar"><div className="composer-route"><span className="model-orb"><Sparkles size={14} /></span><div><strong>Governed chat</strong><small>Policy-aware inference</small></div><ChevronDown size={14} /></div><div className="composer-toolbar-actions"><button title="Attach source" className={sourceAttached ? 'toolbar-active' : ''} onClick={() => setSourceAttached((value) => !value)}><Paperclip size={16} /></button><button title="Format as code"><Code2 size={16} /></button><button title="Expand"><Maximize2 size={16} /></button></div></div><textarea id="playground-composer" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask the control plane anything..." maxLength={12000} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void runPrompt() }} /><div className="composer-bottom"><span><Info size={13} /> Prompts are scanned before model routing</span>{sourceAttached && <span className="source-chip"><Paperclip size={11} /> Source attached</span>}<div><span className="shortcut">⌘ ↵</span><button className="button button-crimson run-button" onClick={() => void runPrompt()} disabled={isRunning}>{isRunning ? <><span className="button-spinner" /> Governing...</> : <><Send size={15} /> Run request</>}</button></div></div></section>{!hasRun && <div className="sample-prompts"><div className="sample-label"><WandSparkles size={14} /> Start with a sample</div>{playgroundPrompts.map((sample) => <button key={sample} onClick={() => loadPrompt(sample)}>{sample}<ChevronRight size={14} /></button>)}</div>}{hasRun && <ResponseCard request={active} running={isRunning} />}</div><aside className="playground-side"><section className={`parameters-card glass-panel ${paramsOpen ? 'open' : 'closed'}`}><button className="parameters-head" onClick={() => setParamsOpen((value) => !value)}><div><div className="eyebrow"><SlidersHorizontal size={12} /> Per-request parameters</div><h3>{paramsOpen ? 'Control how this run behaves' : 'Parameters hidden'}</h3></div><span className="params-toggle">{paramsOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</span></button>{paramsOpen && <div className="parameters-body"><SelectField label="Use case" value={useCase} onChange={setUseCase} options={['Auto-detect', 'Customer Support', 'Internal Knowledge', 'Decision Support']} /><SelectField label="Policy profile" value={policy} onChange={setPolicy} options={['Auto · active profile', 'CP-CS-14 · Customer Support', 'CP-IK-07 · Internal Knowledge', 'CP-DS-11 · Decision Support']} /><SelectField label="Routing preference" value={route} onChange={setRoute} options={['Auto · best fit', 'Fast · lowest latency', 'Capable · highest quality']} /><div className="param-divider" /><div className="param-title"><span>Safety controls</span><small>Apply before generation</small></div><SelectField label="PII action" value={privacy} onChange={setPrivacy} options={['Sanitize', 'Flag', 'Block']} /><SelectField label="Safety strictness" value={strictness} onChange={setStrictness} options={['Low', 'Medium', 'High']} /><SelectField label="Verification" value={verification} onChange={setVerification} options={['Auto', 'On', 'Off']} /><SelectField label="Max cost / request" value={maxCost} onChange={setMaxCost} options={['No limit', '$0.005', '$0.01', '$0.05']} /><div className="param-note"><Shield size={14} /><span>Strictness <b>{strictness.toLowerCase()}</b> buffers ~20 tokens before release.</span></div></div>}</section>{hasRun && <PipelinePanel key={runVersion} stages={displayedStages} live={isRunning || hasRun} />}{!hasRun && <PipelinePanel stages={stageBlueprint} title="Pipeline preview" /> }<div className="side-help"><BookOpen size={16} /><div><strong>Need context?</strong><p>Read how the 10-stage pipeline makes a decision.</p><button>Open docs <ChevronRight size={13} /></button></div></div></aside></div></div>
}

function ResponseCard({ request, running }: { request: RequestRecord; running: boolean }) {
  const [traceOpen, setTraceOpen] = useState(false)
  const blockSignals = request.riskTags.join(' + ') || 'a policy threshold'
  return <section className={`response-card glass-panel ${request.tone} ${running ? 'response-running' : ''}`}><div className="response-head"><div className="response-agent"><span className="agent-avatar"><Shield size={15} /></span><div><strong>ControlPlane response</strong><small>{request.useCase} · {request.createdAt}</small></div></div><div className="response-actions"><button title="Copy response"><Copy size={15} /></button><button title="Regenerate"><RotateCcw size={15} /></button><button title="More"><span className="more-dots">•••</span></button></div></div>{running ? <div className="typing-response"><span /><span /><span /><small>Running governance stages…</small></div> : request.action === 'BLOCK' ? <div className="blocked-response"><div className="blocked-icon"><X size={19} /></div><div><h3>Request blocked before generation</h3><p>This prompt matched <b>{blockSignals}</b>. The active policy prevented model generation, so no unsafe output was released.</p><div className="risk-chips">{request.riskTags.map((tag) => <Badge key={tag} tone={tag === 'privacy' || tag === 'injection' ? 'danger' : 'warn'}>{tag}</Badge>)}</div></div></div> : request.action === 'HUMAN_REVIEW' ? <div className="blocked-response review-response"><div className="blocked-icon"><Shield size={19} /></div><div><h3>Held for human review</h3><p>The decision-support policy requires a reviewer when <b>bias + decision</b> signals overlap. No recommendation was generated.</p><div className="risk-chips"><Badge tone="warn">bias · 82%</Badge><Badge tone="warn">decision · 91%</Badge></div></div></div> : <div className="response-body"><ResponseText text={request.response ?? ''} /><p className="response-disclaimer"><Info size={13} /> {request.verdict === 'Sanitized and allowed' ? 'Direct identifiers were sanitized before generation.' : request.verdict === 'Supported' ? 'Claims matched the attached source and citations are stored in the trace.' : request.verdict === 'PARTIALLY_SUPPORTED' ? 'Some claims matched the attached source; review claim-level citations before relying on this response.' : request.verdict === 'UNSUPPORTED' ? 'The attached source did not support the generated claims; review the escalation in the trace.' : request.action === 'FLAG' ? 'Review the verification flag before relying on this response.' : 'No attached source found. Claims are marked UNVERIFIABLE until you add a retrieval source.'}</p></div>}<div className="response-metadata"><Meta label="Trust" value={`${request.trust}/100`} tone={request.trust > 80 ? 'safe' : request.trust > 50 ? 'warn' : 'danger'} prominent /><Meta label="Safety" value={request.action === 'BLOCK' ? 'Blocked' : request.action === 'HUMAN_REVIEW' ? 'Review' : '98%'} tone={request.action === 'BLOCK' ? 'danger' : request.action === 'HUMAN_REVIEW' ? 'warn' : 'safe'} /><Meta label="Privacy" value={request.riskTags.includes('privacy') ? 'Sanitized' : '100%'} tone={request.riskTags.includes('privacy') ? 'warn' : 'safe'} /><Meta label="Accuracy" value={request.verdict === 'Supported' ? '96%' : request.verdict === 'PARTIALLY_SUPPORTED' ? '61%' : request.action === 'ALLOW' ? '72%' : '—'} tone={request.verdict === 'Supported' ? 'safe' : request.verdict === 'PARTIALLY_SUPPORTED' || request.action === 'ALLOW' ? 'warn' : 'info'} /><div className="meta-separator" /><Meta label="Verdict" value={request.verdict} tone={request.tone} /><Meta label="Model" value={request.model} tone="info" /><Meta label="Latency" value={request.latency} tone="info" /><Meta label="Cost" value={request.cost} tone="info" /></div><div className="message-trace"><button className="trace-label trace-toggle" onClick={() => setTraceOpen((value) => !value)}><span><ActivityIcon /> Stage trace</span><span>{request.stages.filter((stage) => stage.status !== 'queued').length} / 10 events {traceOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span></button><div className="trace-mini">{request.stages.map((stage) => <i key={stage.id} className={`mini-event ${stage.status}`} title={stage.label} />)}</div>{traceOpen && <div className="trace-expanded">{request.stages.map((stage) => <div key={stage.id}><span className={`trace-state ${stage.status}`} /> <b>{stage.label}</b><small>{stage.detail}</small></div>)}</div>}</div></section>
}

function ResponseText({ text }: { text: string }) {
  const chunks = text.split('```')
  return <>{chunks.map((chunk, index) => index % 2 === 1 ? <pre className="response-code" key={index}>{chunk.replace(/^\w+\n/, '')}</pre> : chunk.split(/\n\n|\n/).filter(Boolean).map((paragraph, paragraphIndex) => <p key={`${index}-${paragraphIndex}`}>{paragraph.replace(/^[-*] /, '• ')}</p>))}</>
}
function Meta({ label, value, tone, prominent = false }: { label: string; value: string; tone: 'safe' | 'warn' | 'danger' | 'info'; prominent?: boolean }) { return <div className={`meta-cell ${prominent ? 'prominent' : ''}`}><span>{label}</span><b className={`meta-${tone}`}>{value}</b></div> }
function ActivityIcon() { return <span className="trace-activity-icon"><span /><span /><span /></span> }
