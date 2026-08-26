import { Check, Circle, LoaderCircle, LockKeyhole, ShieldAlert, Timer, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { StageEvent, StageStatus } from '../lib/types'
import { Badge } from './Badge'

function StageIcon({ status }: { status: StageStatus }) {
  if (status === 'blocked') return <ShieldAlert size={14} />
  if (status === 'running') return <LoaderCircle size={14} className="spin" />
  if (status === 'ok' || status === 'warn') return <Check size={14} />
  return <Circle size={10} />
}

export function PipelinePanel({ stages, live = false, title = 'Live governance pipeline' }: { stages: StageEvent[]; live?: boolean; title?: string }) {
  const [visible, setVisible] = useState(live ? stages.filter((stage) => stage.status !== 'queued').length : stages.length)
  useEffect(() => {
    if (!live) { setVisible(stages.length); return }
    // The SSE stream updates stage status progressively. Derive visibility from
    // the stream instead of restarting an animation on every event frame.
    setVisible(stages.filter((stage) => stage.status !== 'queued').length)
  }, [live, stages])

  return <section className="pipeline-card glass-panel"><div className="panel-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />{live ? 'Streaming now' : 'Event stream'}</div><h3>{title}</h3></div><button className="icon-button"><Timer size={15} /></button></div><div className="pipeline-list">{stages.map((stage, index) => { const isVisible = index < visible; return <div className={`pipeline-stage ${isVisible ? 'stage-visible' : 'stage-hidden'} stage-${stage.status}`} key={stage.id}><div className="stage-rail"><span className="stage-node"><StageIcon status={isVisible ? stage.status : 'queued'} /></span>{index !== stages.length - 1 && <span className="stage-line" />}</div><div className="stage-content"><div className="stage-topline"><strong>{stage.label}</strong>{isVisible && stage.duration && <small>{stage.duration}</small>}</div><div className="stage-bottomline"><span>{isVisible ? stage.detail : 'Waiting for previous stage'}</span>{isVisible && stage.status !== 'running' && stage.confidence && <b>{stage.confidence}</b>}</div></div></div> })}</div><div className="pipeline-footer"><span><Zap size={14} /> Async events · sanitized</span><span><LockKeyhole size={12} /> audit ready</span></div></section>
}

export function PipelineLegend() { return <div className="pipeline-legend"><Badge tone="safe">Passed</Badge><Badge tone="warn">Review / flag</Badge><Badge tone="danger">Blocked</Badge></div> }
