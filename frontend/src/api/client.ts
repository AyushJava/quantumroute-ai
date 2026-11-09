import type { ApiErrorBody } from './types'

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'http://localhost:8081'

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** Parses the backend error contract {code,message,details,traceId}. */
export async function parseApiError(res: Response): Promise<ApiError> {
  let code = 'UNKNOWN_ERROR'
  let message = `Request failed with status ${res.status}`
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>
    if (typeof body.code === 'string') code = body.code
    if (typeof body.message === 'string' && body.message.length > 0) {
      message = body.message
    }
  } catch {
    // non-JSON error body — keep defaults
  }
  return new ApiError(res.status, code, message)
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  token?: string | null
}

/** Centralized fetch wrapper. Token is sent as Bearer when provided. */
export async function apiRequest<T>(
  path: string,
  { method = 'GET', body, token }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (res.status === 204) return undefined as T
  if (!res.ok) throw await parseApiError(res)
  return (await res.json()) as T
}
