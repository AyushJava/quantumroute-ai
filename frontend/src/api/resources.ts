import { apiRequest } from './client'
import type {
  JobResponse,
  JobResultResponse,
  JobSubmitRequest,
  Page,
  ScenarioDetail,
  ScenarioSummary,
  ScenarioUpsertRequest,
  WorkspaceResponse,
  WorkspaceUpsertRequest,
} from './types'

const PAGE_SIZE = 100

function pageQuery() {
  return `?size=${PAGE_SIZE}`
}

export function listWorkspaces(token: string | null) {
  return apiRequest<Page<WorkspaceResponse>>(`/api/v1/workspaces${pageQuery()}`, { token })
}

export function createWorkspace(name: string, token: string | null) {
  const body: WorkspaceUpsertRequest = { name }
  return apiRequest<WorkspaceResponse>('/api/v1/workspaces', {
    method: 'POST',
    body,
    token,
  })
}

export function updateWorkspace(id: string, name: string, token: string | null) {
  const body: WorkspaceUpsertRequest = { name }
  return apiRequest<WorkspaceResponse>(`/api/v1/workspaces/${id}`, {
    method: 'PUT',
    body,
    token,
  })
}

export function deleteWorkspace(id: string, token: string | null) {
  return apiRequest<void>(`/api/v1/workspaces/${id}`, {
    method: 'DELETE',
    token,
  })
}

export function getWorkspace(id: string, token: string | null) {
  return apiRequest<WorkspaceResponse>(`/api/v1/workspaces/${id}`, { token })
}

export function listScenarios(workspaceId: string, token: string | null) {
  return apiRequest<Page<ScenarioSummary>>(
    `/api/v1/workspaces/${workspaceId}/scenarios${pageQuery()}`,
    { token },
  )
}

export function createScenario(
  workspaceId: string,
  body: ScenarioUpsertRequest,
  token: string | null,
) {
  return apiRequest<ScenarioDetail>(`/api/v1/workspaces/${workspaceId}/scenarios`, {
    method: 'POST',
    body,
    token,
  })
}

export function getScenario(id: string, token: string | null) {
  return apiRequest<ScenarioDetail>(`/api/v1/scenarios/${id}`, { token })
}

export function updateScenario(
  id: string,
  body: ScenarioUpsertRequest,
  token: string | null,
) {
  return apiRequest<ScenarioDetail>(`/api/v1/scenarios/${id}`, {
    method: 'PUT',
    body,
    token,
  })
}

export function deleteScenario(id: string, token: string | null) {
  return apiRequest<void>(`/api/v1/scenarios/${id}`, {
    method: 'DELETE',
    token,
  })
}

/* ---- Phase 5.5: optimization jobs ---- */

export function submitJob(
  scenarioId: string,
  body: JobSubmitRequest,
  token: string | null,
) {
  return apiRequest<JobResponse>(`/api/v1/scenarios/${scenarioId}/jobs`, {
    method: 'POST',
    body,
    token,
  })
}

export function getJob(jobId: string, token: string | null) {
  return apiRequest<JobResponse>(`/api/v1/jobs/${jobId}`, { token })
}

export function getJobResult(jobId: string, token: string | null) {
  return apiRequest<JobResultResponse>(`/api/v1/jobs/${jobId}/result`, { token })
}
