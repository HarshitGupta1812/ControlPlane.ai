import { ArrowDownRight, ArrowUpRight, BarChart3, Check, ChevronDown, Clock3, DollarSign, Download, Filter, Gauge, ShieldAlert, ShieldCheck, Target, TrendingUp, Users, Zap } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Badge, StatusDot } from '../components/Badge'
import { ActionBadge, KpiCard, MiniSpark, PageHeader, RiskBar, SectionHeader, SelectField } from '../components/Ui'
import { apiFetch, hasLiveApiToken } from '../lib/api'
import { fromApiRequest, loadRequests, type ApiRequestRecord } from '../lib/requestStore'
import { useAuth } from '../auth/context'
import type { RequestRecord } from '../lib/types'

interface DashboardSummary { requests: number; average_trust: number; spend_usd: number; interventions: number }
interface LiveActivityRecord { id: string; action: string; use_case: string; trust_score: number; created_at: string }

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function Dashboard() {
  const { user } = useAuth()
  const liveApi = hasLiveApiToken()
  const { data: summary } = useQuery<DashboardSummary>({ queryKey: ['analytics', 'summary'], queryFn: () => apiFetch<DashboardSummary>('/api/analytics/summary'), enabled: liveApi, staleTime: 45_000 })
  const { data: remoteRequests } = useQuery<{ items: ApiRequestRecord[] }>({ queryKey: ['requests', 'recent'], queryFn: () => apiFetch<{ items: ApiRequestRecord[] }>('/api/requests?limit=100'), enabled: liveApi, staleTime: 30_000 })
  const { data: liveActivity } = useQuery<LiveActivityRecord[]>({ queryKey: ['activity', 'live'], queryFn: () => apiFetch<LiveActivityRecord[]>('/api/activity/live'), enabled: liveApi, refetchInterval: 5_000, staleTime: 0 })
  
  const [filter, setFilter] = useState('All use cases')
  
  // Use remote requests if connected, otherwise fallback to local requests which also has live data from playground
  const rawRequests = liveApi ? (remoteRequests ? remoteRequests.items.map(fromApiRequest) : []) : loadRequests(false)
  const requests = useMemo(() => rawRequests, [rawRequests])
  const visibleRequests = filter === 'All use cases' ? requests : requests.filter((request) => request.useCase === filter)
  
  const displayedActivity = (liveActivity ?? []).slice(0, 4).map((item) => ({ 
    title: item.action === 'BLOCK' ? 'Request blocked' : item.action === 'HUMAN_REVIEW' ? 'Review opened' : 'Request completed', 
    detail: `${item.use_case} · ${item.id}`, 
    time: new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
    tone: item.action === 'BLOCK' ? 'danger' as const : item.action === 'HUMAN_REVIEW' || item.action === 'FLAG' ? 'warn' as const : 'safe' as const 
  }))

  const riskCounts = useMemo(() => {
    const counts = { injection: 0, privacy: 0, hallucination: 0, bias: 0 }
    requests.forEach(r => {
      if (r.riskTags.includes('injection')) counts.injection++
      if (r.riskTags.includes('privacy')) counts.privacy++
      if (r.riskTags.includes('hallucination')) counts.hallucination++
      if (r.riskTags.includes('bias')) counts.bias++
    })
    const total = Math.max(1, requests.length)
    return [
      { label: 'Injection', value: Math.round(counts.injection / total * 100), count: counts.injection, color: 'crimson' },
      { label: 'Privacy / PII', value: Math.round(counts.privacy / total * 100), count: counts.privacy, color: 'amber' },
      { label: 'Hallucination', value: Math.round(counts.hallucination / total * 100), count: counts.hallucination, color: 'cyan' },
      { label: 'Bias', value: Math.round(counts.bias / total * 100), count: counts.bias, color: 'purple' },
    ]
  }, [requests])

  return (
    <div className="dashboard-page">
      <PageHeader title={`${getGreeting()}, ${user?.name || 'User'}`} description="Here’s what your control plane protected.">
        <SelectField value={filter} onChange={setFilter} options={['All use cases', 'Customer Support', 'Internal Knowledge', 'Decision Support']} />
      </PageHeader>
      
      <div className="kpi-grid">
        <KpiCard label="Governed requests" value={summary ? summary.requests.toLocaleString() : (requests.length > 0 ? requests.length.toString() : '0')} />
        <KpiCard label="Average trust" value={summary ? summary.average_trust.toFixed(1) : (requests.length > 0 ? (requests.reduce((a, b) => a + b.trust, 0) / requests.length).toFixed(1) : '—')} />
        <KpiCard label="Interventions" value={summary ? summary.interventions.toLocaleString() : (requests.filter(r => r.action !== 'ALLOW').length.toString() || '0')} deltaTone="safe" />
        <KpiCard label="Model spend" value={summary ? `$${summary.spend_usd.toFixed(2)}` : (requests.length > 0 ? `$${requests.reduce((a, b) => a + Number(b.cost.replace('$', '') || 0), 0).toFixed(2)}` : '—')} deltaTone="safe" />
      </div>

      <div className="dashboard-grid dashboard-grid-main">
        <section className="chart-card glass-panel">
          <SectionHeader title="Decision Distribution" detail="Across visible requests" icon={<BarChart3 size={14} />} />
          <DecisionChart requests={visibleRequests} />
        </section>

        <section className="activity-card glass-panel">
          <SectionHeader title="Live activity" detail="Updates every 5 seconds" icon={<Zap size={14} />} />
          <div className="live-indicator"><StatusDot tone="safe" pulse /> Event stream connected</div>
          <div className="activity-list">
            {displayedActivity.length > 0 ? displayedActivity.map((item) => (
              <div className="activity-row" key={item.title + item.time + item.detail}>
                <span className={`activity-icon activity-${item.tone}`}>
                  {item.tone === 'safe' ? <Check size={14} /> : item.tone === 'danger' ? <ShieldAlert size={14} /> : item.tone === 'warn' ? <Target size={14} /> : <Zap size={14} />}
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </div>
                <time>{item.time}</time>
              </div>
            )) : <div className="empty-state compact"><small>No recent activity</small></div>}
          </div>
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid-secondary">
        <section className="violations-card glass-panel">
          <SectionHeader title="Top violations" detail="Frequency of risk tags" icon={<ShieldAlert size={14} />} />
          <div className="risk-list">
            {riskCounts.map((risk) => (
              <div className="risk-row" key={risk.label}>
                <div className="risk-label">
                  <span className={`risk-icon ${risk.color}`}><ShieldAlert size={13} /></span>
                  <strong>{risk.label}</strong>
                  <small>{risk.count} events</small>
                </div>
                <div className="risk-value">
                  <RiskBar value={risk.value} color={risk.color} />
                  <b>{risk.value}%</b>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="model-card glass-panel">
          <SectionHeader title="Trust Score Distribution" detail="Frequency by bucket" icon={<Gauge size={14} />} />
          <TrustHistogram requests={visibleRequests} />
        </section>

        <section className="trust-breakdown-card glass-panel">
          <SectionHeader title="Use Case Distribution" detail="Volume across segments" icon={<Users size={14} />} />
          <UseCaseChart requests={visibleRequests} />
        </section>
      </div>

      <section className="requests-table-card glass-panel">
        <SectionHeader title="Recent governed requests" detail="Your latest activity" icon={<Clock3 size={14} />} />
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Use case</th>
                <th>Decision</th>
                <th>Trust</th>
                <th>Model</th>
                <th>Latency</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {visibleRequests.slice(0, 10).map((request) => (
                <tr key={request.id}>
                  <td>
                    <div className="request-cell">
                      <span className={`request-status ${request.tone}`}><StatusDot tone={request.tone} /></span>
                      <div>
                        <strong>{request.prompt.slice(0, 42)}{request.prompt.length > 42 ? '…' : ''}</strong>
                        <small>{request.id}</small>
                      </div>
                    </div>
                  </td>
                  <td><span className="table-usecase">{request.useCase}</span></td>
                  <td><ActionBadge action={request.action} /></td>
                  <td><strong className={request.trust > 80 ? 'text-safe' : request.trust > 50 ? 'text-warn' : 'text-danger'}>{request.trust}</strong></td>
                  <td><span className="table-model">{request.model.split(' / ')[0]}</span></td>
                  <td>{request.latency}</td>
                  <td>{request.createdAt}</td>
                </tr>
              ))}
              {visibleRequests.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '20px' }}>No governed requests available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function DecisionChart({ requests }: { requests: RequestRecord[] }) {
  const counts = { allow: 0, block: 0, flag: 0, review: 0, sanitize: 0 }
  requests.forEach(r => {
    if (r.action === 'ALLOW') counts.allow++
    if (r.action === 'BLOCK') counts.block++
    if (r.action === 'FLAG') counts.flag++
    if (r.action === 'HUMAN_REVIEW') counts.review++
    if (r.action === 'SANITIZE') counts.sanitize++
  })
  const total = Math.max(1, requests.length)
  const pAllow = (counts.allow / total) * 100
  const pBlock = (counts.block / total) * 100
  const pFlag = (counts.flag / total) * 100
  const pReview = (counts.review / total) * 100
  
  if (requests.length === 0) return <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>No data</div>

  return (
    <div style={{ display: 'flex', gap: '30px', alignItems: 'center', height: '220px', padding: '0 20px' }}>
      <div className="model-donut" style={{ width: '120px', height: '120px', background: `conic-gradient(var(--emerald) 0 ${pAllow}%, var(--crimson) ${pAllow}% ${pAllow+pBlock}%, var(--amber) ${pAllow+pBlock}% ${pAllow+pBlock+pFlag}%, var(--purple) ${pAllow+pBlock+pFlag}% ${pAllow+pBlock+pFlag+pReview}%, var(--cyan) ${pAllow+pBlock+pFlag+pReview}% 100%)` }}>
        <span>{total}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
        <DecisionLegend label="Allow" count={counts.allow} color="var(--emerald)" />
        <DecisionLegend label="Block" count={counts.block} color="var(--crimson)" />
        <DecisionLegend label="Flag" count={counts.flag} color="var(--amber)" />
        <DecisionLegend label="Review" count={counts.review} color="var(--purple)" />
        <DecisionLegend label="Sanitize" count={counts.sanitize} color="var(--cyan)" />
      </div>
    </div>
  )
}

function DecisionLegend({ label, count, color }: { label: string, count: number, color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#888' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
        <span>{label}</span>
      </div>
      <b style={{ color: '#ccc', fontFamily: 'monospace' }}>{count}</b>
    </div>
  )
}

function TrustHistogram({ requests }: { requests: RequestRecord[] }) {
  const buckets = [0, 0, 0, 0, 0] // 0-20, 20-40, 40-60, 60-80, 80-100
  requests.forEach(r => {
    if (r.trust <= 20) buckets[0]++
    else if (r.trust <= 40) buckets[1]++
    else if (r.trust <= 60) buckets[2]++
    else if (r.trust <= 80) buckets[3]++
    else buckets[4]++
  })
  const max = Math.max(...buckets, 1)

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '160px', padding: '20px 10px 0', gap: '10px' }}>
      {buckets.map((count, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', flex: 1 }}>
          <div style={{ height: '100px', width: '100%', display: 'flex', alignItems: 'flex-end', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
            <div style={{ width: '100%', background: i > 3 ? 'var(--emerald)' : i > 2 ? 'var(--cyan)' : i > 1 ? 'var(--amber)' : 'var(--crimson)', height: `${(count / max) * 100}%`, borderRadius: '4px', opacity: 0.8, transition: 'height 0.3s' }} />
          </div>
          <span style={{ fontSize: '9px', color: '#666', fontFamily: 'monospace' }}>{i*20}-{i*20+20}</span>
        </div>
      ))}
    </div>
  )
}

function UseCaseChart({ requests }: { requests: RequestRecord[] }) {
  const counts: Record<string, number> = {}
  requests.forEach(r => {
    counts[r.useCase] = (counts[r.useCase] || 0) + 1
  })
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const max = sorted.length > 0 ? sorted[0][1] : 1
  
  if (requests.length === 0) return <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>No data</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
      {sorted.map(([name, count], i) => (
        <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
            <span style={{ color: '#aaa' }}>{name}</span>
            <span style={{ fontFamily: 'monospace', color: '#888' }}>{count}</span>
          </div>
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(count / max) * 100}%`, background: ['var(--cyan)', 'var(--purple)', 'var(--emerald)', 'var(--amber)'][i % 4], borderRadius: '2px' }} />
          </div>
        </div>
      ))}
    </div>
  )
}
