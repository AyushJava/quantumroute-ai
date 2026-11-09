import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { RegisterPage } from './RegisterPage'
import * as authApi from '../api/auth'
import { ApiError } from '../api/client'

vi.mock('../api/auth')

function renderRegister() {
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>,
  )
}

async function fillValid() {
  await userEvent.type(screen.getByLabelText(/display name/i, { exact: false }), 'Ayush')
  await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
  await userEvent.type(screen.getByLabelText(/^password$/i), 'password123')
  await userEvent.type(screen.getByLabelText(/confirm password/i), 'password123')
}

describe('RegisterPage', () => {
  beforeEach(() => vi.resetAllMocks())

  it('validates required fields', async () => {
    renderRegister()
    await userEvent.click(
      screen.getByRole('button', { name: /create account/i }),
    )
    expect(screen.getByText('Email is required.')).toBeInTheDocument()
    expect(screen.getByText('Password is required.')).toBeInTheDocument()
    expect(authApi.register).not.toHaveBeenCalled()
  })

  it('enforces 8-char minimum and confirm match', async () => {
    renderRegister()
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/^password$/i), 'short')
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'different')
    await userEvent.click(
      screen.getByRole('button', { name: /create account/i }),
    )
    expect(
      screen.getByText('Password must be at least 8 characters.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument()
    expect(authApi.register).not.toHaveBeenCalled()
  })

  it('accepts an 8-character ASCII password', async () => {
    vi.mocked(authApi.register).mockResolvedValue({
      id: '1', email: 'a@b.com', displayName: null, role: 'USER',
    })
    renderRegister()
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/^password$/i), 'abcdefgh')
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'abcdefgh')
    await userEvent.click(
      screen.getByRole('button', { name: /create account/i }),
    )
    expect(authApi.register).toHaveBeenCalled()
    expect(
      screen.queryByText('Password must not exceed 72 UTF-8 bytes.'),
    ).not.toBeInTheDocument()
  })

  it('accepts a 72-byte ASCII password', async () => {
    vi.mocked(authApi.register).mockResolvedValue({
      id: '1', email: 'a@b.com', displayName: null, role: 'USER',
    })
    const pw = 'a'.repeat(72)
    renderRegister()
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/^password$/i), pw)
    await userEvent.type(screen.getByLabelText(/confirm password/i), pw)
    await userEvent.click(
      screen.getByRole('button', { name: /create account/i }),
    )
    expect(authApi.register).toHaveBeenCalled()
  })

  it('rejects a 73-byte ASCII password', async () => {
    renderRegister()
    const pw = 'a'.repeat(73)
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/^password$/i), pw)
    await userEvent.type(screen.getByLabelText(/confirm password/i), pw)
    await userEvent.click(
      screen.getByRole('button', { name: /create account/i }),
    )
    expect(
      screen.getByText('Password must not exceed 72 UTF-8 bytes.'),
    ).toBeInTheDocument()
    expect(authApi.register).not.toHaveBeenCalled()
  })

  it('rejects a multibyte password exceeding 72 UTF-8 bytes', async () => {
    renderRegister()
    // 37 × 'é' = 74 UTF-8 bytes but only 37 characters
    const pw = 'é'.repeat(37)
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/^password$/i), pw)
    await userEvent.type(screen.getByLabelText(/confirm password/i), pw)
    await userEvent.click(
      screen.getByRole('button', { name: /create account/i }),
    )
    expect(
      screen.getByText('Password must not exceed 72 UTF-8 bytes.'),
    ).toBeInTheDocument()
    expect(authApi.register).not.toHaveBeenCalled()
  })

  it('shows duplicate-email error', async () => {
    vi.mocked(authApi.register).mockRejectedValue(
      new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'Email already registered'),
    )
    renderRegister()
    await fillValid()
    await userEvent.click(
      screen.getByRole('button', { name: /create account/i }),
    )
    expect(
      await screen.findByText(/already exists/i),
    ).toBeInTheDocument()
  })

  it('submits registration payload', async () => {
    vi.mocked(authApi.register).mockResolvedValue({
      id: '1', email: 'a@b.com', displayName: 'Ayush', role: 'USER',
    })
    renderRegister()
    await fillValid()
    await userEvent.click(
      screen.getByRole('button', { name: /create account/i }),
    )
    expect(authApi.register).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'password123',
      displayName: 'Ayush',
    })
    expect(
      await screen.findByText(/account created/i),
    ).toBeInTheDocument()
  })
})
