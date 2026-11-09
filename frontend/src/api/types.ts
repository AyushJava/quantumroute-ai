export interface UserResponse {
  id: string
  email: string
  displayName: string | null
  role: 'USER' | 'ADMIN'
}

export interface RegisterRequest {
  email: string
  password: string
  displayName?: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface AuthResponse {
  accessToken: string
  tokenType: string
  expiresInSeconds: number
  user: UserResponse
}

export interface ApiErrorBody {
  code: string
  message: string
  details?: Record<string, unknown>
  traceId?: string
}

/* ---- Phase 5.3: workspaces & scenarios ---- */

export interface Page<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export interface WorkspaceResponse {
  id: string
  name: string
  createdAt: string
}

export interface WorkspaceUpsertRequest {
  name: string
}

export interface ScenarioSummary {
  id: string
  workspaceId: string
  name: string
  graphVersion: string
  createdAt: string
}

export interface ScenarioGraph {
  name?: string
  directed?: boolean
  nodes: { id: string; lat?: number; lon?: number }[]
  edges: {
    id?: string
    source: string
    target: string
    length_m: number
    speed_kmh: number
    congestion?: number
    cost?: number
    closed?: boolean
  }[]
}

export interface ScenarioDetail extends Omit<ScenarioSummary, never> {
  graph: ScenarioGraph
  config: Record<string, unknown>
}

export interface ScenarioUpsertRequest {
  name?: string
  graphVersion?: string
  graph?: ScenarioGraph
  config?: Record<string, unknown>
}
