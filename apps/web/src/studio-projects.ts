import { apiClient } from './api'
import {
  deserializeAgtx,
  serializeAgtx,
  type StudioDocument,
} from './studio-agtx'

export async function listStudioProjects(limit?: number, search?: string) {
  const response = await apiClient.api.studio.projects.$get({
    query: {
      ...(limit === undefined ? {} : { limit: String(limit) }),
      ...(search ? { search } : {}),
    },
  })
  if (!response.ok) throw await responseError(response)
  const body = await response.json()
  return body.projects
}

export async function createStudioProject(document: StudioDocument) {
  const archive = serializeAgtx(document)
  const response = await fetch(
    `/api/studio/projects?name=${encodeURIComponent(document.name)}`,
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/vnd.mba.agent+zip' },
      body: new Blob([archive.buffer as ArrayBuffer], {
        type: 'application/vnd.mba.agent+zip',
      }),
    },
  )
  if (!response.ok) throw await responseError(response)
  return parseProject(await response.json())
}

export async function loadStudioProject(projectId: string) {
  const metadataResponse = await apiClient.api.studio.projects[':id'].$get({
    param: { id: projectId },
  })
  if (!metadataResponse.ok) throw await responseError(metadataResponse)
  const project = (await metadataResponse.json()).project
  const fileResponse = await apiClient.api.studio.projects[':id'].file.$get({
    param: { id: projectId },
  })
  if (!fileResponse.ok) throw await responseError(fileResponse)
  const document = deserializeAgtx(
    project.name,
    new Uint8Array(await fileResponse.arrayBuffer()),
  )
  const openedResponse = await apiClient.api.studio.projects[':id'].open.$post({
    param: { id: projectId },
  })
  if (!openedResponse.ok) throw await responseError(openedResponse)
  return {
    document,
    project,
    conversation: Array.isArray(project.conversation)
      ? project.conversation
      : [],
  }
}

export async function saveStudioConversation(
  projectId: string,
  messages: unknown[],
) {
  const response = await fetch(
    `/api/studio/projects/${encodeURIComponent(projectId)}/conversation`,
    {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    },
  )
  if (!response.ok) throw await responseError(response)
}

export async function saveStudioProject(
  projectId: string,
  document: StudioDocument,
) {
  const archive = serializeAgtx(document)
  const response = await fetch(
    `/api/studio/projects/${encodeURIComponent(projectId)}/file`,
    {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/vnd.mba.agent+zip' },
      body: new Blob([archive.buffer as ArrayBuffer], {
        type: 'application/vnd.mba.agent+zip',
      }),
    },
  )
  if (!response.ok) throw await responseError(response)
  return parseProject(await response.json())
}

export async function renameStudioProject(projectId: string, name: string) {
  const response = await fetch(
    `/api/studio/projects/${encodeURIComponent(projectId)}`,
    {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    },
  )
  if (!response.ok) throw await responseError(response)
  const body: unknown = await response.json()
  if (
    !body ||
    typeof body !== 'object' ||
    !('project' in body) ||
    !body.project ||
    typeof body.project !== 'object' ||
    !('id' in body.project) ||
    typeof body.project.id !== 'string' ||
    !('name' in body.project) ||
    typeof body.project.name !== 'string' ||
    !('lastEditedAt' in body.project) ||
    typeof body.project.lastEditedAt !== 'string'
  )
    throw new Error('Studio returned an invalid project')
  return {
    id: body.project.id,
    name: body.project.name,
    lastEditedAt: body.project.lastEditedAt,
  }
}

function parseProject(body: unknown): { id: string } {
  if (
    !body ||
    typeof body !== 'object' ||
    !('project' in body) ||
    !body.project ||
    typeof body.project !== 'object' ||
    !('id' in body.project) ||
    typeof body.project.id !== 'string'
  )
    throw new Error('Studio returned an invalid project')
  return { id: body.project.id }
}

async function responseError(response: Response) {
  const body: unknown = await response.json().catch(() => undefined)
  return new Error(
    body &&
      typeof body === 'object' &&
      'message' in body &&
      typeof body.message === 'string'
      ? body.message
      : `Studio request failed (${response.status})`,
  )
}
