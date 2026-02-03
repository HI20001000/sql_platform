import { apiBaseUrl } from '../apiBaseUrl.js'

export const fetchProjectTree = async ({ q, status, assignee, includeEmpty } = {}) => {
  const response = await fetch(`${apiBaseUrl}/api/create-project/tree`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q, status, assignee, includeEmpty }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error?.message || 'Failed to load project tree')
  }

  return response.json()
}

export const fetchTaskSteps = async (taskId) => {
  const response = await fetch(`${apiBaseUrl}/api/create-project/task-steps`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ taskId }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error?.message || 'Failed to load task steps')
  }

  return response.json()
}
