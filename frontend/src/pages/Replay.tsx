import { useEffect, useMemo, useState } from 'react'
import { Clock3, FastForward, Pause, Play, RotateCcw, SkipBack, SkipForward, Sparkles, StepBack, StepForward } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Badge, StatusDot } from '../components/Badge'
import { PageHeader, SelectField } from '../components/Ui'
import { useRequestDetail, useWorkspaceRequests } from '../lib/useRequests'

export function Replay() {
  const [params] = useSearchParams()
  const urlRequestId = params.get('request')
  const requests = useWorkspaceRequests()
  const [selectedId, setSelectedId] = useState(urlRequestId || '')
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  
  const requestFromList = useMemo(() => requests.find((item) => item.id === selectedId) ?? requests[0], [requests, selectedId])
  const request = useRequestDetail(requestFromList?.id) ?? requestFromList

  useEffect(() => {
    if (!selectedId && request) setSelectedId(request.id)
    if (urlRequestId && urlRequestId !== selectedId) setSelectedId(urlRequestId)
  }, [request, selectedId, urlRequestId])
  
  useEffect(() => {
    if (!playing || !request) return
    const timer = window.setInterval(() => setStep((value) => {
      if (value >= request.stages.length - 1) { setPlaying(false); return value }
      return value + 1
    }), 850)
    return () => window.clearInterval(timer)
  }, [playing, request])

  if (!request) return <div className="replay-page"><PageHeader title="Decision Replay" description="Walk an event stream without re-running the model." /><div className="empty-state glass-panel"><div className="empty-icon"><Sparkles size={18} /></div><h3>No requests to replay</h3><p>Run a governed prompt in Playground first.</p></div></div>
  
  const current = request.stages[Math.min(step, request.stages.length - 1)]
  
  return <div className="replay-page"><PageHeader title="Decision Replay" description="Walk an event stream without re-running the model."><SelectField value={request.id} onChange={(value) => { setSelectedId(value); setStep(0) }} options={requests.map((item) => item.id)} /></PageHeader><div className="replay-layout"><section className="replay-main glass-panel"><div className="replay-toolbar"><div className="replay-request"><span className={`request-status ${request.tone}`}><StatusDot tone={request.tone} /></span><div><strong>{request.id}</strong><small>{request.useCase} · {request.createdAt}</small></div></div><Badge tone={request.tone}>{request.action.replace('_', ' ')}</Badge></div><div className="replay-prompt"><span>Prompt</span><p>{request.prompt}</p></div><div className="replay-stage-track"><div className="track-line" style={{ width: `${(step / Math.max(request.stages.length - 1, 1)) * 100}%` }} /><div className="track-nodes">{request.stages.map((stage, index) => <button key={stage.id} className={`track-node ${index <= step ? 'visited' : ''} ${index === step ? 'current' : ''} ${stage.status === 'blocked' ? 'danger' : ''}`} onClick={() => setStep(index)} title={stage.label}><span>{index + 1}</span><small>{stage.label.replace(/\..*/, '')}</small></button>)}</div></div><div className="replay-event-card"><div className="event-card-head"><div><div className="eyebrow"><span className="eyebrow-dot" /> Event {String(step + 1).padStart(2, '0')} / {request.stages.length}</div><h2>{current.name}</h2></div><span className="event-ts"><Clock3 size={13} /> +{current.duration ?? '—'}</span></div><p>{current.detail}</p><div className="event-json"><div className="json-head"><span>Sanitized event payload</span><Badge tone={current.tone}>{current.status}</Badge></div><pre>{JSON.stringify({ stage: current.name, status: current.status, duration_ms: parseInt(current.duration ?? '0') || 0, confidence: current.confidence, redacted: true, request_id: request.id }, null, 2)}</pre></div></div><div className="replay-controls"><button className="control-icon" onClick={() => setStep(0)}><SkipBack size={16} /></button><button className="control-icon" onClick={() => setStep((value) => Math.max(value - 1, 0))}><StepBack size={16} /></button><button className="play-control" onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={16} /> : <Play size={16} fill="currentColor" />} {playing ? 'Pause replay' : 'Play replay'}</button><button className="control-icon" onClick={() => setStep((value) => Math.min(value + 1, request.stages.length - 1))}><StepForward size={16} /></button><button className="control-icon" onClick={() => setStep(request.stages.length - 1)}><SkipForward size={16} /></button><span className="control-speed"><FastForward size={14} /> 1×</span><button className="control-reset" onClick={() => { setPlaying(false); setStep(0) }}><RotateCcw size={14} /> Reset</button></div></section><aside className="replay-sidebar"><section className="replay-summary glass-panel"><div className="panel-heading"><div><div className="eyebrow">Decision summary</div><h3>What happened</h3></div><Sparkles size={16} /></div><div className="summary-score"><span>Trust</span><strong className={request.trust > 80 ? 'text-safe' : request.trust > 50 ? 'text-warn' : 'text-danger'}>{request.trust}<small>/100</small></strong></div><div className="summary-list"><div><span>Use case</span><b>{request.useCase}</b></div><div><span>Policy</span><b>CP-{request.useCase === 'Decision Support' ? 'DS-11' : request.useCase === 'Customer Support' ? 'CS-14' : 'IK-07'}</b></div><div><span>Risk tags</span><b>{request.riskTags.length ? request.riskTags.join(' · ') : 'None'}</b></div><div><span>Model served</span><b>{request.model}</b></div></div></section></aside></div></div>
}
