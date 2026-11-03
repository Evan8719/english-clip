import { authorizedApiFetch } from './sync'

export interface Exercise {
  id: string
  kind: 'listen' | 'shadow' | 'retell'
  prompt: string
  answer: string
  reference: string
}

export interface MediaItem {
  id: string
  title: string
  kind: 'audio' | 'video' | 'text'
  source: string
  transcript: string
  exercises: Exercise[]
  status: 'awaiting-file' | 'uploaded' | 'processing' | 'ready' | 'failed'
  error: string
  bytes: number
  extension: string
  createdAt: string
  updatedAt: string
  streamUrl: string | null
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authorizedApiFetch(path, init)
  const data = await response.json() as { message?: string } & T
  if (!response.ok) throw new Error(data.message || `请求失败（${response.status}）`)
  return data
}

export async function listMedia(): Promise<MediaItem[]> {
  const data = await request<{ items: MediaItem[] }>('/api/media')
  return data.items
}

export async function getMedia(id: string): Promise<MediaItem> {
  const data = await request<{ item: MediaItem }>(`/api/media/${id}`)
  return data.item
}

export async function uploadMedia(input: { title: string; source: string; transcript: string; kind: MediaItem['kind']; file?: File }): Promise<MediaItem> {
  const created = await request<{ item: MediaItem }>('/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: input.title, source: input.source, transcript: input.transcript, kind: input.kind }) })
  let item = created.item
  if (input.file) {
    const extension = input.file.name.split('.').pop()?.toLowerCase() || ''
    const response = await authorizedApiFetch(`/api/media/${item.id}/file`, { method: 'PUT', headers: { 'X-File-Extension': extension, 'Content-Type': 'application/octet-stream' }, body: input.file })
    const data = await response.json() as { item?: MediaItem; message?: string }
    if (!response.ok || !data.item) throw new Error(data.message || `文件上传失败（${response.status}）`)
    item = data.item
  }
  if (item.status === 'uploaded') {
    try { item = await processMedia(item.id) } catch { /* keep uploaded item for later processing */ }
  }
  return item
}

export async function processMedia(id: string): Promise<MediaItem> {
  const data = await request<{ item: MediaItem }>(`/api/media/${id}/process`, { method: 'POST' })
  return data.item
}

export async function updateMediaTranscript(id: string, transcript: string): Promise<MediaItem> {
  const data = await request<{ item: MediaItem }>(`/api/media/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript }) })
  return data.item
}

export async function aiKeyConfigured(): Promise<boolean> {
  const data = await request<{ configured: boolean }>('/api/ai/status')
  return data.configured
}

export async function saveAiKey(apiKey: string): Promise<void> {
  await request('/api/ai/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey }) })
}

export async function deleteAiKey(): Promise<void> {
  await request('/api/ai/key', { method: 'DELETE' })
}

export async function chatWithAi(message: string, focus: string, history: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<string> {
  const data = await request<{ reply: string }>('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, focus, history }) })
  return data.reply
}
