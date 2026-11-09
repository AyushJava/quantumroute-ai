import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { login as apiLogin } from '../api/auth'
import type { LoginRequest, UserResponse } from '../api/types'
import { AuthContext, type AuthContextValue } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number | null>(null)

  const handleLogin = useCallback(async (request: LoginRequest) => {
    const res = await apiLogin(request)
    setToken(res.accessToken)
    setTokenExpiresAt(Date.now() + res.expiresInSeconds * 1000)
    setUser(res.user)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setTokenExpiresAt(null)
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      tokenExpiresAt,
      isAuthenticated: token !== null && user !== null,
      login: handleLogin,
      logout,
    }),
    [user, token, tokenExpiresAt, handleLogin, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
