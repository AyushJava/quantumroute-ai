import { createContext } from 'react'
import type { UserResponse } from '../api/types'

export interface AuthContextValue {
  user: UserResponse | null
  /** In-memory only — never persisted to web storage. */
  token: string | null
  tokenExpiresAt: number | null
  isAuthenticated: boolean
  login: (request: import('../api/types').LoginRequest) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
