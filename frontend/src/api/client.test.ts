import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ApiError, apiRequest, parseApiError } from './client'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('parseApiError', () => {
  it('maps the backend error contract', async () => {
    const res = jsonResponse(401, {
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
      details: {},
      traceId: 'abc',
    })
    const err = await parseApiError(res)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
    expect(err.code).toBe('INVALID_CREDENTIALS')
    expect(err.message).toBe('Invalid email or password')
  })

  it('falls back gracefully on non-JSON bodies', async () => {
    const res = new Response('oops', { status: 502 })
    const err = await parseApiError(res)
    expect(err.status).toBe(502)
    expect(err.code).toBe('UNKNOWN_ERROR')
  })
})

describe('apiRequest', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('sends bearer token and parses success', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { ok: true }),
    )
    const out = await apiRequest<{ ok: boolean }>('/api/v1/x', {
      method: 'POST',
      body: { a: 1 },
      token: 'tok123',
    })
    expect(out.ok).toBe(true)
    const [, init] = fetchMock.mock.calls[0]
    expect((init?.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer tok123',
    )
  })

  it('throws ApiError on 409 EMAIL_ALREADY_EXISTS', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(409, {
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Email already registered',
      }),
    )
    await expect(
      apiRequest('/api/v1/auth/register', { method: 'POST', body: {} }),
    ).rejects.toMatchObject({ status: 409, code: 'EMAIL_ALREADY_EXISTS' })
  })
})
