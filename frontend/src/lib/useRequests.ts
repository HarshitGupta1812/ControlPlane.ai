import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch, hasLiveApiToken } from './api'
import { fromApiDetail, fromApiRequest, loadRequests, type ApiRequestDetail, type ApiRequestRecord } from './requestStore'
import type { RequestRecord } from './types'

export function useWorkspaceRequests(): RequestRecord[] {
  const liveApi = hasLiveApiToken()
  const { data } = useQuery<{ items: ApiRequestRecord[] }>({ queryKey: ['requests', 'workspace'], queryFn: () => apiFetch<{ items: ApiRequestRecord[] }>('/api/requests?limit=50'), enabled: liveApi, staleTime: 30_000 })
  const [local] = useState(loadRequests)
  return liveApi ? (data?.items?.map(fromApiRequest) ?? []) : local
}

export function useRequestDetail(requestId: string | undefined): RequestRecord | undefined {
  const liveApi = hasLiveApiToken()
  const { data } = useQuery<ApiRequestDetail>({ queryKey: ['request', requestId], queryFn: () => apiFetch<ApiRequestDetail>(`/api/requests/${requestId}`), enabled: liveApi && Boolean(requestId), staleTime: 60_000 })
  return data ? fromApiDetail(data) : undefined
}
