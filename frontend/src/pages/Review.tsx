import { CheckCircle2, Search, Shield, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../components/Badge'
import { PageHeader, SearchField } from '../components/Ui'
import { useWorkspaceRequests, useResolveRequest } from '../lib/useRequests'
import type { RequestRecord } from '../lib/types'

export function Review() {
  const requests = useWorkspaceRequests()
  const reviewQueue = requests.filter((r) => r.action === 'HUMAN_REVIEW')
  const [search, setSearch] = useState('')
  const resolveRequest = useResolveRequest()
  
  const filtered = reviewQueue.filter(r => search ? r.prompt.toLowerCase().includes(search.toLowerCase()) || r.id.toLowerCase().includes(search.toLowerCase()) : true)

  const handleResolve = (id: string, action: 'BLOCK' | 'PASS') => {
    // PASS is equivalent to ALLOW
    resolveRequest(id, action === 'BLOCK' ? 'BLOCK' : 'ALLOW').catch(console.error)
  }

  return (
    <div className="review-page">
      <PageHeader title="Review Queue" description="Requests held by policy requiring manual intervention.">
        <SearchField placeholder="Search pending reviews..." value={search} onChange={setSearch} />
      </PageHeader>
      
      <div className="review-layout">
        <div className="review-list">
          {filtered.map((request) => (
            <ReviewCard key={request.id} request={request} onResolve={handleResolve} />
          ))}
          {filtered.length === 0 && (
            <div className="empty-state glass-panel">
              <div className="empty-icon"><Shield size={18} /></div>
              <h3>Queue is empty</h3>
              <p>No requests currently require manual review.</p>
            </div>
          )}
        </div>
        
        <aside className="review-side">
          <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '13px', marginBottom: '15px' }}>Queue metrics</h3>
            <div style={{ display: 'grid', gap: '15px' }}>
              <div>
                <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', fontFamily: 'monospace' }}>Pending</div>
                <div style={{ fontSize: '24px', fontWeight: 500 }}>{filtered.length}</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function ReviewCard({ request, onResolve }: { request: RequestRecord, onResolve: (id: string, action: 'BLOCK' | 'PASS') => void }) {
  return (
    <div className="review-card glass-panel">
      <div className="review-head">
        <div className="review-meta">
          <strong>{request.id}</strong>
          <small>{request.useCase} · {request.createdAt}</small>
        </div>
        <Badge tone="warn">Needs review</Badge>
      </div>
      
      <div className="review-body">
        <div className="review-section">
          <h4>Prompt payload</h4>
          <div className="review-content">{request.prompt}</div>
        </div>
        
        <div className="review-section">
          <h4>Detected risk signals</h4>
          <div className="risk-chips">
            {request.riskTags.map(tag => (
              <Badge key={tag} tone="warn">{tag}</Badge>
            ))}
            {request.riskTags.length === 0 && <span style={{ fontSize: '11px', color: '#888' }}>No specific tags</span>}
          </div>
        </div>
      </div>
      
      <div className="review-actions">
        <button className="button button-ghost button-small" onClick={() => onResolve(request.id, 'BLOCK')}><XCircle size={14} /> Block request</button>
        <button className="button button-crimson button-small" onClick={() => onResolve(request.id, 'PASS')}><CheckCircle2 size={14} /> Approve request</button>
      </div>
    </div>
  )
}
