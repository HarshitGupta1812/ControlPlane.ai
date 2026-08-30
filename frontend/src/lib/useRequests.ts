import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, hasLiveApiToken } from './api'
import { fromApiRequest, loadRequests, resolveLocalRequest, type ApiRequestRecord } from './requestStore'
import type { RequestRecord } from './types'

export function useWorkspaceRequests(): RequestRecord[] {
  const liveApi = hasLiveApiToken()
  const { data } = useQuery<{ items: ApiRequestRecord[] }>({ queryKey: ['requests', 'workspace'], queryFn: () => apiFetch<{ items: ApiRequestRecord[] }>('/api/requests?limit=50'), enabled: liveApi, staleTime: 30_000 })
  const [local, setLocal] = useState(loadRequests)

  useEffect(() => {
    if (liveApi) return
    const handler = () => setLocal(loadRequests())
    window.addEventListener('cp_requests_updated', handler)
    return () => window.removeEventListener('cp_requests_updated', handler)
  }, [liveApi])

  return liveApi ? (data?.items?.map(fromApiRequest) ?? []) : local
}

export function useResolveRequest() {
  const queryClient = useQueryClient()
  const liveApi = hasLiveApiToken()

  return async (id: string, action: 'ALLOW' | 'BLOCK') => {
    if (liveApi) {
      await apiFetch(`/api/requests/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ action })
      })
      queryClient.invalidateQueries({ queryKey: ['requests'] })
      queryClient.invalidateQueries({ queryKey: ['request', id] })
    } else {
      resolveLocalRequest(id, action)
    }
  }
}

type RequestDetailResponse = ApiRequestRecord & { events?: unknown[] }

export function useRequestDetail(requestId: string | undefined): RequestRecord | undefined {
  const liveApi = hasLiveApiToken()
  // GET /api/requests/{id} returns the record fields plus a real `events` array,
  // flat (no wrapper). Passing it to fromApiRequest lets it use the persisted
  // per-stage telemetry instead of a synthesized fallback.
  const { data } = useQuery<RequestDetailResponse>({ queryKey: ['request', requestId], queryFn: () => apiFetch<RequestDetailResponse>(`/api/requests/${requestId}`), enabled: liveApi && Boolean(requestId), staleTime: 60_000 })
  const [local] = useState(loadRequests)

  if (liveApi) return data ? fromApiRequest(data) : undefined
  return local.find(r => r.id === requestId)
}
