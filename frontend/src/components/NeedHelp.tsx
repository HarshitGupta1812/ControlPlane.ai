import { useRef, useState } from 'react'
import { Bot, ChevronDown, LifeBuoy, LoaderCircle, Minus, Send, ShieldCheck, Sparkles, X } from 'lucide-react'
import type { RequestRecord } from '../lib/types'
import { hasLiveApiToken, streamApi } from '../lib/api'
import { loadRequests } from '../lib/requestStore'

interface Message { id: number; role: 'assistant' | 'user'; text: string; source?: string }

const starter: Message = {
  id: 1,
  role: 'assistant',
  text: 'Hi! I can explain ControlPlane and your workspace activity. Ask me about a request, trust trends, policies, or a pipeline stage.',
}

function answerFor(input: string, requests: RequestRecord[]) {
  const normalized = input.toLowerCase()
  if (normalized.includes('blocked') || normalized.includes('last request')) {
    const blocked = requests.find((request) => request.action === 'BLOCK')
    return blocked ? { text: `Your latest blocked request was ${blocked.id}. It matched ${blocked.riskTags.join(' + ') || 'a policy violation'} and was stopped before model routing.`, source: `From your recent requests · ${blocked.id}` } : { text: 'Sign in to inspect your own blocked requests. The public assistant cannot access workspace activity.', source: 'Authentication boundary' }
  }
  if (normalized.includes('average') || normalized.includes('trust')) {
    if (!requests.length) return { text: 'Sign in to view your own trust score and workspace usage. I do not have access to activity on the public landing page.', source: 'Authentication boundary' }
    const average = Math.round(requests.reduce((sum, request) => sum + request.trust, 0) / requests.length)
    return { text: `Your visible sample has an average trust score of ${average}/100. This week, the strongest component is privacy at 94%; verification is the main drag at 72% because several answers have no attached source.`, source: 'From your scoped trust summary' }
  }
  if (normalized.includes('policy')) {
    return { text: 'There are three active use-case policies: Customer Support Guardrails, Internal Knowledge Balanced, and Decision Support Strict. Decision Support treats unsupported or unverifiable claims as review-or-block outcomes.', source: 'From your active policy profiles' }
  }
  if (normalized.includes('replay') || normalized.includes('req_')) {
    return { text: 'Open Replay from the sidebar, choose a request, then use the step controls to inspect every event. Replay reads the append-only event stream and never re-runs the model.', source: 'ControlPlane product guide' }
  }
  if (normalized.includes('hello') || normalized.includes('hi')) {
    return { text: 'Hello. What would you like to inspect — a blocked request, your trust trend, or how a policy stage works?', source: 'ControlPlane assistant' }
  }
  return { text: 'I can help with ControlPlane features, pipeline stages, policies, trust scores, replay, or your own recent usage. I can’t answer general-knowledge questions or act as a free-form chatbot.', source: 'Scope reminder' }
}

export function NeedHelp({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)
  const [messages, setMessages] = useState<Message[]>([{ ...starter, text: compact ? 'Hi. I can explain ControlPlane features, governance stages, policies, and how to get started. Sign in when you want to inspect workspace activity.' : starter.text }])
  const nextId = useRef(10)

  async function send(text = draft) {
    const clean = text.trim()
    if (!clean || typing) return
    const userMessage: Message = { id: nextId.current++, role: 'user', text: clean }
    setMessages((current) => [...current, userMessage])
    setDraft('')
    setTyping(true)
    const liveToken = hasLiveApiToken()
    try {
      if (liveToken) {
        let responseText = ''
        let sourceText = 'Scoped product and workspace data'
        await streamApi('/api/assistant/stream', { message: clean, conversation: messages.slice(-10).map((message) => ({ role: message.role, content: message.text })) }, (event) => {
          if (event.event === 'token') responseText += String(event.data.text ?? '')
          if (event.event === 'context') {
            const sources = Array.isArray(event.data.sources) ? event.data.sources.map(String).join(' · ') : ''
            if (sources) sourceText = sources
          }
        })
        if (!responseText.trim()) throw new Error('The assistant returned an empty response.')
        setMessages((current) => [...current, { id: nextId.current++, role: 'assistant', text: responseText.trim(), source: sourceText }])
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 280))
        const next = answerFor(clean, compact ? [] : loadRequests())
        setMessages((current) => [...current, { id: nextId.current++, role: 'assistant', text: next.text, source: next.source }])
      }
    } catch {
      const next = answerFor(clean, compact || liveToken ? [] : loadRequests())
      setMessages((current) => [...current, { id: nextId.current++, role: 'assistant', text: next.text, source: `${next.source} · offline fallback` }])
    } finally {
      setTyping(false)
    }
  }

  return <div className={`help-root ${compact ? 'help-compact' : ''}`}>
    {open && !minimized && <section className="assistant-panel glass-panel" aria-label="Need Help assistant">
      <header className="assistant-header"><div className="assistant-title"><span className="assistant-icon"><Bot size={17} /></span><div><strong>Need Help</strong><small><span className="online-dot" /> Scoped product assistant</small></div></div><div className="assistant-actions"><button aria-label="Minimize assistant" onClick={() => setMinimized(true)}><Minus size={15} /></button><button aria-label="Close assistant" onClick={() => setOpen(false)}><X size={15} /></button></div></header>
      <div className="assistant-messages">{messages.map((message) => <div key={message.id} className={`assistant-message ${message.role === 'user' ? 'from-user' : 'from-bot'}`}><div className="message-bubble">{message.text.split(/\n/).map((line, i) => { const text = line.trim(); if (!text) return null; if (text.startsWith('* ') || text.startsWith('- ')) return <li key={i} style={{ marginLeft: '16px', marginTop: '4px' }}>{text.substring(2).replace(/\*\*(.*?)\*\*/g, '$1')}</li>; return <p key={i} style={{ marginTop: i === 0 ? '0' : '8px', marginBottom: '0' }}>{text.replace(/\*\*(.*?)\*\*/g, '$1')}</p>; })}</div></div>)}{typing && <div className="assistant-message from-bot"><div className="message-bubble assistant-typing"><LoaderCircle size={13} className="spin" /> Checking scoped context…</div></div>}</div>
      <div className="assistant-suggestions"><button onClick={() => void send('Why was my last request blocked?')}>Why was I blocked?</button><button onClick={() => void send('What is my average trust score?')}>Average trust</button></div>
      <form className="assistant-composer" onSubmit={(event) => { event.preventDefault(); void send() }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about ControlPlane..." aria-label="Ask the assistant" disabled={typing} /><button aria-label="Send message" disabled={typing || !draft.trim()}><Send size={16} /></button></form>
    </section>}
    {open && minimized && <button className="assistant-minimized glass-panel" onClick={() => setMinimized(false)}><Sparkles size={15} /> Need Help <ChevronDown size={14} /></button>}
    <button id="assistant-launcher" className={`help-fab ${open ? 'is-open' : ''}`} onClick={() => { setOpen((value) => !value); setMinimized(false) }} aria-label={open ? 'Close Need Help' : 'Open Need Help'}>{open ? <X size={21} /> : <LifeBuoy size={21} />}<span className="fab-pulse" /></button>
  </div>
}
