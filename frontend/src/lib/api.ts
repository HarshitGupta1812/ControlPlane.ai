const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/$/, '')

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('cp_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function errorMessage(response: Response) {
  const text = await response.text()
  try {
    const payload = JSON.parse(text) as { detail?: string; message?: string }
    return payload.detail ?? payload.message ?? `Request failed: ${response.status}`
  } catch {
    return text.replace(/<[^>]+>/g, '').trim() || `Request failed: ${response.status}`
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) throw new ApiError(await errorMessage(response), response.status)
  return response.json() as Promise<T>
}

export interface StreamEvent { event: string; data: Record<string, unknown> }

export async function streamApi(path: string, body: unknown, onEvent: (event: StreamEvent) => void): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) })
  if (!response.ok || !response.body) throw new ApiError(await errorMessage(response), response.status || 500)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const eventMatch = frame.match(/^event:\s*(.+)$/m)
        const dataMatch = frame.match(/^data:\s*(.+)$/m)
        if (!dataMatch) continue
        let parsed: Record<string, unknown>
        try { parsed = JSON.parse(dataMatch[1]) as Record<string, unknown> } catch { continue }
        const nextEvent = { event: eventMatch?.[1]?.trim() ?? 'message', data: parsed }
        if (nextEvent.event === 'error') throw new Error(String(nextEvent.data.message ?? 'The stream failed.'))
        onEvent(nextEvent)
      }
      if (done) break
    }
    if (buffer.trim()) {
      const dataMatch = buffer.match(/^data:\s*(.+)$/m)
      const eventMatch = buffer.match(/^event:\s*(.+)$/m)
      if (dataMatch) {
        const parsed = JSON.parse(dataMatch[1]) as Record<string, unknown>
        const nextEvent = { event: eventMatch?.[1]?.trim() ?? 'message', data: parsed }
        if (nextEvent.event === 'error') throw new Error(String(nextEvent.data.message ?? 'The stream failed.'))
        onEvent(nextEvent)
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export function isApiMode() {
  // Vite proxies /api and /v1 in development; Docker/nginx proxies them in production.
  return Boolean(API_BASE) || typeof window !== 'undefined'
}

export function hasLiveApiToken() {
  const token = localStorage.getItem('cp_token')
  return Boolean(token && token !== 'demo-session-token')
}

export { API_BASE }
