import { BarChart3, Clock3, Gauge, ShieldAlert, ShieldCheck, Target, TrendingUp, Users, Zap, Check } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { StatusDot } from '../components/Badge'
import { ActionBadge, PageHeader, SectionHeader, SelectField } from '../components/Ui'
import { apiFetch, hasLiveApiToken } from '../lib/api'
import { fromApiRequest, loadRequests, type ApiRequestRecord } from '../lib/requestStore'
import { useAuth } from '../auth/context'
import type { RequestRecord } from '../lib/types'

interface DashboardSummary { requests: number; average_trust: number; spend_usd: number; interventions: number }
interface LiveActivityRecord { id: string; action: string; use_case: string; trust_score: number; created_at: string }

const USE_CASE_MAP: Record<string, string> = {
  'Customer Support': 'customer_support',
  'Internal Knowledge': 'internal_knowledge',
  'Decision Support': 'decision_support',
}

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
  
  const rawRequests = liveApi ? (remoteRequests ? remoteRequests.items.map(fromApiRequest) : []) : loadRequests(false)
  const requests = useMemo(() => rawRequests, [rawRequests])

  // Normalize filter to backend key for comparison
  const filterKey = USE_CASE_MAP[filter] ?? null
  const visibleRequests = filterKey ? requests.filter((r) => r.useCase === filterKey || r.useCase === filter) : requests
  
  const displayedActivity = (liveActivity ?? []).slice(0, 5).map((item) => ({ 
    title: item.action === 'BLOCK' ? 'Request blocked' : item.action === 'HUMAN_REVIEW' ? 'Review opened' : item.action === 'FLAG' ? 'Request flagged' : 'Request completed', 
    detail: `${item.use_case} · ${item.id.slice(0, 8)}`, 
    time: new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
    tone: item.action === 'BLOCK' ? 'danger' as const : item.action === 'HUMAN_REVIEW' || item.action === 'FLAG' ? 'warn' as const : 'safe' as const 
  }))

  // Compute derived metrics
  const totalRequests = summary?.requests ?? requests.length
  const avgTrust = summary?.average_trust ?? (requests.length > 0 ? requests.reduce((a, b) => a + b.trust, 0) / requests.length : 0)
  const interventionCount = summary?.interventions ?? requests.filter(r => r.action !== 'ALLOW').length
  const interventionRate = totalRequests > 0 ? Math.round((interventionCount / totalRequests) * 100) : 0
  const totalSpend = summary?.spend_usd ?? (requests.length > 0 ? requests.reduce((a, b) => a + Number(b.cost.replace('$', '') || 0), 0) : 0)

  const actionCounts = useMemo(() => {
    const c = { allow: 0, block: 0, flag: 0, review: 0, sanitize: 0 }
    visibleRequests.forEach(r => {
      if (r.action === 'ALLOW') c.allow++
      else if (r.action === 'BLOCK') c.block++
      else if (r.action === 'FLAG') c.flag++
      else if (r.action === 'HUMAN_REVIEW') c.review++
      else if (r.action === 'SANITIZE') c.sanitize++
    })
    return c
  }, [visibleRequests])

  return (
    <div className="dashboard-page">
      <PageHeader title={`${getGreeting()}, ${user?.name || 'User'}`} description="Here's what your control plane protected.">
        <SelectField value={filter} onChange={setFilter} options={['All use cases', 'Customer Support', 'Internal Knowledge', 'Decision Support']} />
      </PageHeader>
      
      {/* KPI Row */}
      <div className="kpi-grid kpi-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="kpi-card-enhanced glass-panel">
          <div className="kpi-icon-wrap kpi-icon-cyan"><ShieldCheck size={18} /></div>
          <div className="kpi-body">
            <span className="kpi-label">Governed Requests</span>
            <strong className="kpi-value">{totalRequests.toLocaleString()}</strong>
          </div>
        </div>
        <div className="kpi-card-enhanced glass-panel">
          <div className="kpi-icon-wrap kpi-icon-emerald"><Gauge size={18} /></div>
          <div className="kpi-body">
            <span className="kpi-label">Average Trust</span>
            <strong className="kpi-value">{avgTrust > 0 ? avgTrust.toFixed(1) : '—'}<small>/100</small></strong>
          </div>
        </div>
        <div className="kpi-card-enhanced glass-panel">
          <div className="kpi-icon-wrap kpi-icon-amber"><ShieldAlert size={18} /></div>
          <div className="kpi-body">
            <span className="kpi-label">Interventions</span>
            <strong className="kpi-value">{interventionCount}<small className="kpi-pct">/ {interventionRate}%</small></strong>
          </div>
        </div>
        <div className="kpi-card-enhanced glass-panel">
          <div className="kpi-icon-wrap kpi-icon-crimson"><TrendingUp size={18} /></div>
          <div className="kpi-body">
            <span className="kpi-label">Model Spend</span>
            <strong className="kpi-value">${totalSpend.toFixed(4)}</strong>
          </div>
        </div>
      </div>

      {/* Primary Row: Trust Trend + Live Activity */}
      <div className="dashboard-grid dashboard-grid-main">
        <section className="chart-card glass-panel" style={{ padding: '24px' }}>
          <SectionHeader title="Trust & Latency Trend" detail="Rolling metrics across recent requests" icon={<TrendingUp size={14} />} />
          <TrustTrendChart requests={visibleRequests} />
        </section>

        <section className="activity-card glass-panel">
          <SectionHeader title="Live Activity" detail="Real-time event stream" icon={<Zap size={14} />} />
          <div className="live-indicator"><StatusDot tone="safe" pulse /> Connected</div>
          <div className="activity-list">
            {displayedActivity.length > 0 ? displayedActivity.map((item) => (
              <div className="activity-row" key={item.title + item.time + item.detail}>
                <span className={`activity-icon activity-${item.tone}`}>
                  {item.tone === 'safe' ? <Check size={14} /> : item.tone === 'danger' ? <ShieldAlert size={14} /> : <Target size={14} />}
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

      {/* Secondary Row: Decision Distribution Pie + Trust Histogram + Use Case Volume */}
      <div className="dashboard-grid dashboard-grid-tertiary" style={{ marginTop: '24px' }}>
        <section className="chart-card glass-panel" style={{ padding: '24px' }}>
          <SectionHeader title="Decision Distribution" detail="Policy action breakdown" icon={<BarChart3 size={14} />} />
          <DecisionPieChart counts={actionCounts} total={visibleRequests.length} />
        </section>

        <section className="chart-card glass-panel" style={{ padding: '24px' }}>
          <SectionHeader title="Trust Score Distribution" detail="Frequency by range" icon={<Gauge size={14} />} />
          <TrustHistogram requests={visibleRequests} />
        </section>

        <section className="chart-card glass-panel" style={{ padding: '24px' }}>
          <SectionHeader title="Use Case Volume" detail="Requests per category" icon={<Users size={14} />} />
          <UseCaseBarChart requests={visibleRequests} />
        </section>
      </div>

      {/* Request Table */}
      <section className="requests-table-card glass-panel" style={{ marginTop: '24px' }}>
        <SectionHeader title="Recent Governed Requests" detail="Latest activity log" icon={<Clock3 size={14} />} />
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Use Case</th>
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

/* ---------- Trust & Latency Trend ---------- */
function TrustTrendChart({ requests }: { requests: RequestRecord[] }) {
  if (requests.length === 0) return <div className="chart-empty">No data available</div>

  const data = [...requests].reverse().slice(0, 30).map((r, i) => ({
    name: `Req ${i + 1}`,
    trust: r.trust,
    latency: parseInt(r.latency.replace('ms', '') || '0')
  }))

  return (
    <div style={{ width: '100%', height: '300px', marginTop: '10px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorTrust" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--emerald)" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="var(--emerald)" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--purple)" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="var(--purple)" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis dataKey="name" stroke="#55555c" tick={{ fontSize: 12, fill: '#77777f' }} />
          <YAxis yAxisId="left" stroke="#55555c" tick={{ fontSize: 12, fill: '#77777f' }} />
          <YAxis yAxisId="right" orientation="right" stroke="#55555c" tick={{ fontSize: 12, fill: '#77777f' }} />
          <Tooltip 
            contentStyle={{ backgroundColor: 'rgba(20, 20, 23, 0.9)', border: '1px solid var(--border)', borderRadius: '8px' }}
            itemStyle={{ color: '#eee', fontSize: '13px' }}
            labelStyle={{ display: 'none' }}
          />
          <Area yAxisId="left" type="monotone" dataKey="trust" stroke="var(--emerald)" fillOpacity={1} fill="url(#colorTrust)" strokeWidth={2} name="Trust Score" />
          <Area yAxisId="right" type="monotone" dataKey="latency" stroke="var(--purple)" fillOpacity={1} fill="url(#colorLatency)" strokeWidth={2} name="Latency (ms)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ---------- Decision Distribution Pie Chart ---------- */
const PIE_COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#a855f7', '#06b6d4']

function DecisionPieChart({ counts, total }: { counts: { allow: number; block: number; flag: number; review: number; sanitize: number }; total: number }) {
  if (total === 0) return <div className="chart-empty">No data available</div>

  const data = [
    { name: 'Allow', value: counts.allow },
    { name: 'Block', value: counts.block },
    { name: 'Flag', value: counts.flag },
    { name: 'Review', value: counts.review },
    { name: 'Sanitize', value: counts.sanitize },
  ].filter(d => d.value > 0)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginTop: '10px' }}>
      <div style={{ width: '180px', height: '180px', flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={3} dataKey="value" stroke="none">
              {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip itemStyle={{ color: '#eee' }} contentStyle={{ backgroundColor: 'rgba(20, 20, 23, 0.9)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: '#eee' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {data.map((d, i) => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
            <span style={{ color: '#a4a4ab', minWidth: '60px' }}>{d.name}</span>
            <strong style={{ color: '#e4e4e9' }}>{d.value}</strong>
            <span style={{ color: '#6c6c74', fontSize: '12px' }}>{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Trust Score Histogram ---------- */
const HIST_COLORS = ['#ef4444', '#f59e0b', '#f59e0b', '#06b6d4', '#22c55e']

function TrustHistogram({ requests }: { requests: RequestRecord[] }) {
  const labels = ['0–20', '21–40', '41–60', '61–80', '81–100']
  const buckets = [0, 0, 0, 0, 0]
  requests.forEach(r => {
    if (r.trust <= 20) buckets[0]++
    else if (r.trust <= 40) buckets[1]++
    else if (r.trust <= 60) buckets[2]++
    else if (r.trust <= 80) buckets[3]++
    else buckets[4]++
  })

  if (requests.length === 0) return <div className="chart-empty">No data available</div>

  const data = labels.map((label, i) => ({ range: label, count: buckets[i], fill: HIST_COLORS[i] }))

  return (
    <div style={{ width: '100%', height: '220px', marginTop: '10px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <XAxis dataKey="range" stroke="#55555c" tick={{ fontSize: 12, fill: '#77777f' }} />
          <YAxis stroke="#55555c" tick={{ fontSize: 12, fill: '#77777f' }} allowDecimals={false} />
          <Tooltip cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} itemStyle={{ color: '#eee' }} contentStyle={{ backgroundColor: 'rgba(20, 20, 23, 0.9)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: '#eee' }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Requests">
            {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ---------- Use Case Volume Bar Chart ---------- */
const UC_COLORS = ['#06b6d4', '#a855f7', '#22c55e', '#f59e0b', '#ef4444']

function UseCaseBarChart({ requests }: { requests: RequestRecord[] }) {
  const counts: Record<string, number> = {}
  requests.forEach(r => { counts[r.useCase] = (counts[r.useCase] || 0) + 1 })

  if (requests.length === 0) return <div className="chart-empty">No data available</div>

  const data = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))

  return (
    <div style={{ width: '100%', height: '220px', marginTop: '10px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
          <XAxis type="number" stroke="#55555c" tick={{ fontSize: 12, fill: '#77777f' }} allowDecimals={false} />
          <YAxis type="category" dataKey="name" stroke="#55555c" tick={{ fontSize: 12, fill: '#77777f' }} width={120} />
          <Tooltip cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} itemStyle={{ color: '#eee' }} contentStyle={{ backgroundColor: 'rgba(20, 20, 23, 0.9)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: '#eee' }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} name="Requests">
            {data.map((_, i) => <Cell key={i} fill={UC_COLORS[i % UC_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
