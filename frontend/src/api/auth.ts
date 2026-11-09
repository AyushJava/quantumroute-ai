import { apiRequest } from './client'
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  UserResponse,
} from './types'

export function register(request: RegisterRequest): Promise<UserResponse> {
  return apiRequest<UserResponse>('/api/v1/auth/register', {
    method: 'POST',
    body: request,
  })
}

export function login(request: LoginRequest): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: request,
  })
}
