import { ApiError } from './client'

/** Maps backend error codes to user-friendly messages. */
export function friendlyApiMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired. Please sign in again.'
    if (err.status === 0 || err instanceof TypeError) {
      return 'Cannot reach the backend. Check that the server is running.'
    }
    switch (err.code) {
      case 'WORKSPACE_NAME_EXISTS':
        return 'A workspace with this name already exists.'
      case 'WORKSPACE_NOT_EMPTY':
        return 'This workspace still contains scenarios. Delete them first.'
      case 'SCENARIO_NAME_EXISTS':
        return 'A scenario with this name already exists in this workspace.'
      case 'SCENARIO_HAS_JOBS':
        return 'This scenario has optimization jobs and cannot be deleted.'
      case 'INVALID_GRAPH':
        return 'The graph is invalid. Check nodes, edges and edge attributes.'
      case 'GRAPH_VERSION_UNCHANGED':
        return 'Graph content changed — increment graphVersion (e.g. v1 → v2).'
      case 'VALIDATION_FAILED':
      case 'MALFORMED_REQUEST':
        return 'Please check the information you entered.'
      default:
        return err.message || fallback
    }
  }
  if (err instanceof TypeError) {
    return 'Cannot reach the backend. Check that the server is running.'
  }
  return fallback
}
