import { useMemo, useState } from 'react'
import { AlertTriangle, Clock3, Filter, Play, Search, ShieldAlert, Sparkles, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge, StatusDot } from '../components/Badge'
import { ActionBadge, PageHeader, RiskBar, SearchField } from '../components/Ui'
import { useWorkspaceRequests } from '../lib/useRequests'
import type { RequestRecord } from '../lib/types'

export function Traces() {
  const requests = useWorkspaceRequests()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<RequestRecord | null>(null)
  const navigate = useNavigate()

  const filtered = useMemo(() => {
    const term = search.toLowerCase()
    return term ? requests.filter((r) => r.prompt.toLowerCase().includes(term) || r.id.toLowerCase().includes(term) || r.useCase.toLowerCase().includes(term)) : requests
  }, [requests, search])

  return (
    <div className="traces-page">
      <PageHeader title="Audit Log" description="A complete ledger of every prompt, decision, and verification check.">
        <SearchField placeholder="Search prompts, IDs..." value={search} onChange={setSearch} />
      </PageHeader>
      
      <div className="table-wrap glass-panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Request / Prompt</th>
              <th>Use Case</th>
              <th>Action</th>
              <th>Trust Score</th>
              <th>Risk Tags</th>
              <th>Latency</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((request) => (
              <tr key={request.id} className="interactive-row" onClick={() => setSelected(request)}>
                <td>
                  <div className="request-cell">
                    <span className={`request-status ${request.tone}`}><StatusDot tone={request.tone} /></span>
                    <div>
                      <strong>{request.prompt.slice(0, 48)}{request.prompt.length > 48 ? '…' : ''}</strong>
                      <small>{request.id}</small>
                    </div>
                  </div>
                </td>
                <td><span className="table-usecase">{request.useCase}</span></td>
                <td><ActionBadge action={request.action} /></td>
                <td><strong className={request.trust > 80 ? 'text-safe' : request.trust > 50 ? 'text-warn' : 'text-danger'}>{request.trust}</strong></td>
                <td>
                  {request.riskTags.length ? (
                    <div className="risk-tags-cell">
                      {request.riskTags.slice(0, 2).map((tag) => <span key={tag} className="tiny-risk-tag">{tag}</span>)}
                      {request.riskTags.length > 2 && <span className="tiny-risk-tag">+{request.riskTags.length - 2}</span>}
                    </div>
                  ) : <span className="table-usecase">—</span>}
                </td>
                <td><span className="latency-cell"><Clock3 size={10} /> {request.latency}</span></td>
                <td>{request.createdAt}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} className="empty-cell">No requests found matching your search.</td></tr>}
          </tbody>
        </table>
      </div>

      {selected && (
        <>
          <div className="drawer-backdrop" onClick={() => setSelected(null)} />
          <div className="trace-drawer">
            <div className="drawer-head">
              <div style={{ minWidth: 0, paddingRight: '12px' }}>
                <div className="eyebrow">Request details</div>
                <h3 style={{ wordBreak: 'break-all', fontSize: '15px', marginTop: '6px' }}>{selected.id}</h3>
              </div>
              <div className="drawer-actions">
                <button className="button button-crimson button-small" onClick={() => navigate(`/app/pipeline-replay?request=${selected.id}`)}>
                  <Play size={12} fill="currentColor" /> Open in Replay
                </button>
                <button className="drawer-close" onClick={() => setSelected(null)}><X size={18} /></button>
              </div>
            </div>
            
            <div className="drawer-body" style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <section className="drawer-section" style={{ marginTop: 0 }}>
                <h4>Prompt</h4>
                <div className="drawer-prompt" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{selected.prompt}</div>
              </section>
              
              <section className="drawer-section" style={{ marginTop: 0 }}>
                <h4>Governance result</h4>
                <div className="drawer-kpis">
                  <div className="drawer-kpi">
                    <span>Decision</span>
                    <ActionBadge action={selected.action} />
                  </div>
                  <div className="drawer-kpi">
                    <span>Trust score</span>
                    <strong className={selected.trust > 80 ? 'text-safe' : selected.trust > 50 ? 'text-warn' : 'text-danger'}>{selected.trust}</strong>
                  </div>
                  <div className="drawer-kpi">
                    <span>Use case</span>
                    <strong>{selected.useCase}</strong>
                  </div>
                </div>
              </section>
              
              <section className="drawer-section" style={{ marginTop: 0 }}>
                <h4>Detected risks</h4>
                {selected.riskTags.length > 0 ? (
                  <div className="drawer-risks">
                    {selected.riskTags.map((tag) => (
                      <div key={tag} className="drawer-risk-item">
                        <ShieldAlert size={14} className={tag === 'privacy' || tag === 'injection' ? 'text-danger' : 'text-warn'} />
                        <span>{tag} detected in payload</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="drawer-risk-item safe" style={{ borderLeft: '2px solid var(--emerald)', background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>
                    <Sparkles size={14} className="text-safe" />
                    <span>No risk signals detected</span>
                  </div>
                )}
              </section>

              {selected.response && (
                <section className="drawer-section" style={{ marginTop: 0 }}>
                  <h4>Generated response</h4>
                  <div className="drawer-response" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{selected.response}</div>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
