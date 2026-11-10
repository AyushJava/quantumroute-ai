import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import * as authApi from './api/auth'

vi.mock('./api/auth')

const USER = { id: 'u1', email: 'a@b.com', displayName: 'A', role: 'USER' as const }

describe('App auth guard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    window.history.pushState({}, '', '/')
    // jsdom lacks matchMedia — ThemeProvider needs it
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: false, media: q, addEventListener: vi.fn(),
      removeEventListener: vi.fn(), addListener: vi.fn(),
      removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
    }))
  })

  it('redirects unauthenticated users to /login', async () => {
    window.history.pushState({}, '', '/workspaces')
    render(<App />)
    expect(await screen.findByLabelText('Email')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
  })

  it('logs in, reaches dashboard, and logout returns to /login', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      accessToken: 'tok', tokenType: 'Bearer',
      expiresInSeconds: 3600, user: USER,
    })
    render(<App />)
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.com')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.click(
      screen.getByRole('button', { name: /sign in|log in/i }),
    )
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign out' }),
    )
    await waitFor(() =>
      expect(window.location.pathname).toBe('/login'))
  })
})
