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

/* ---- Phase 5.5: optimization jobs ---- */

export type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT'
export type JobAlgorithm = 'DIJKSTRA' | 'ASTAR' | 'QPSO'

export interface JobSubmitRequest {
  algorithm: JobAlgorithm
  sourceNodeId: string
  targetNodeId: string
  objectiveWeights?: { alpha: number; beta: number; gamma: number }
  parameters?: Record<string, unknown>
}

export interface JobResponse {
  id: string
  scenarioId: string
  status: JobStatus
  algorithm: JobAlgorithm
  createdAt: string
  finishedAt: string | null
  errorMessage: string | null
}

/** RouteOut from the optimizer: {nodeIds, edgeIds, geometry?}.
 *  Empty object {} for infeasible results. */
export interface JobRoute {
  nodeIds?: string[]
  edgeIds?: string[]
  /** GeoJSON geometry; coordinates are [lon, lat]. */
  geometry?: Record<string, unknown> | null
}

export interface JobMetrics {
  distanceMeters: number | null
  estimatedTravelTimeSeconds: number | null
  congestionPenalty: number | null
  objectiveValue: number | null
}

export interface QpsoAlgorithmMetadata {
  seed?: number
  iterationsRun?: number
  usedRepair?: boolean
  repairRate?: number
  feasibilityRate?: number
  convergenceTrace?: number[]
  parameters?: Record<string, unknown>
}

export interface JobResultResponse {
  jobId: string
  feasible: boolean
  route: JobRoute
  metrics: JobMetrics | null
  runtimeMs: number | null
  algorithmMetadata: QpsoAlgorithmMetadata | null
}
