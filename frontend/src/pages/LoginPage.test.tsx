import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from './LoginPage'
import { AuthProvider } from '../auth/AuthProvider'
import * as authApi from '../api/auth'
import { ApiError } from '../api/client'

vi.mock('../api/auth')

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => vi.resetAllMocks())

  it('shows field errors for empty submission', async () => {
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(screen.getByText('Email is required.')).toBeInTheDocument()
    expect(screen.getByText('Password is required.')).toBeInTheDocument()
    expect(authApi.login).not.toHaveBeenCalled()
  })

  it('rejects malformed email', async () => {
    renderLogin()
    await userEvent.type(screen.getByLabelText(/email/i), 'not-an-email')
    await userEvent.type(screen.getByLabelText("Password"), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(authApi.login).not.toHaveBeenCalled()
  })

  it('shows friendly error on invalid credentials', async () => {
    vi.mocked(authApi.login).mockRejectedValue(
      new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'),
    )
    renderLogin()
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText("Password"), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(
      await screen.findByText('Invalid email or password.'),
    ).toBeInTheDocument()
  })

  it('submits credentials and logs in', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      accessToken: 'jwt-token',
      tokenType: 'Bearer',
      expiresInSeconds: 900,
      user: { id: '1', email: 'a@b.com', displayName: 'A', role: 'USER' },
    })
    renderLogin()
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText("Password"), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(authApi.login).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'password123',
    })
  })

  it('toggles password visibility', async () => {
    renderLogin()
    const pw = screen.getByLabelText("Password")
    expect(pw).toHaveAttribute('type', 'password')
    await userEvent.click(
      screen.getByRole('button', { name: /show password/i }),
    )
    expect(pw).toHaveAttribute('type', 'text')
  })
})
