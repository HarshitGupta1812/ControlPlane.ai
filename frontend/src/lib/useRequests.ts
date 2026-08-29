import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch, hasLiveApiToken } from './api'
import { fromApiRequest, loadRequests, type ApiRequestRecord } from './requestStore'
import type { RequestRecord } from './types'

export function useWorkspaceRequests(): RequestRecord[] {
  const liveApi = hasLiveApiToken()
  const { data } = useQuery<{ items: ApiRequestRecord[] }>({ queryKey: ['requests', 'workspace'], queryFn: () => apiFetch<{ items: ApiRequestRecord[] }>('/api/requests?limit=50'), enabled: liveApi, staleTime: 30_000 })
  const [local] = useState(loadRequests)
  return liveApi ? (data?.items?.map(fromApiRequest) ?? []) : local
}

export function useRequestDetail(requestId: string | undefined): RequestRecord | undefined {
  const liveApi = hasLiveApiToken()
  const { data } = useQuery<{ item: ApiRequestRecord }>({ queryKey: ['request', requestId], queryFn: () => apiFetch<{ item: ApiRequestRecord }>(`/api/requests/${requestId}`), enabled: liveApi && Boolean(requestId), staleTime: 60_000 })
  const [local] = useState(loadRequests)
  
  if (liveApi) return data?.item ? fromApiRequest(data.item) : undefined
  return local.find(r => r.id === requestId)
}
