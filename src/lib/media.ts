import { authorizedApiFetch } from './sync'
import type { BookChapter } from './books'

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
  kind: 'audio' | 'video' | 'text' | 'book'
  level?: string
  levelBasis?: string
  contentHash?: string
  author?: string
  chapters?: BookChapter[]
  readingPosition?: { chapter: number; paragraph: number }
  segments?: Array<{ start: number; end: number; text: string }>
  playbackPosition?: number
  source: string
  transcript: string
  exercises: Exercise[]
  status: 'awaiting-file' | 'uploaded' | 'processing' | 'ready' | 'failed' | 'queued-local' | 'transcribing-local'
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
export async function patchMedia(id: string, changes: object): Promise<MediaItem> {
  return (await request<{ item: MediaItem }>(`/api/media/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) })).item
}

export async function uploadMedia(input: { title: string; source: string; transcript: string; kind: MediaItem['kind']; file?: File; level?: string; levelBasis?: string; contentHash?: string; chapters?: BookChapter[]; author?: string; segments?: MediaItem['segments'] }): Promise<MediaItem> {
  const { file, ...metadata } = input
  const created = await request<{ item: MediaItem; duplicate?: boolean }>('/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metadata) })
  if (created.duplicate && (created.item.extension || !file)) return created.item
  let item = created.item
  if (file) {
    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    const response = await authorizedApiFetch(`/api/media/${item.id}/file`, { method: 'PUT', headers: { 'X-File-Extension': extension, 'Content-Type': 'application/octet-stream' }, body: file })
    const data = await response.json() as { item?: MediaItem; message?: string }
    if (!response.ok || !data.item) throw new Error(data.message || `文件上传失败（${response.status}）`)
    item = data.item
  }
  if (item.status === 'uploaded' && input.transcript.trim()) {
    try { item = await processMedia(item.id) } catch { /* keep uploaded item for later processing */ }
  }
  if (item.status === 'uploaded' && !input.transcript.trim()) {
    item = (await request<{ item: MediaItem }>(`/api/media/${item.id}/local`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).item
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

export async function saveAiKey(apiKey: string, provider = 'openai'): Promise<void> {
  await request('/api/ai/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey, provider }) })
}

export async function deleteAiKey(provider = 'openai'): Promise<void> {
  await request(`/api/ai/key?provider=${provider}`, { method: 'DELETE' })
}
export async function deepseekConfigured(): Promise<boolean> { return (await request<{ deepseekConfigured: boolean }>('/api/ai/status')).deepseekConfigured }

export async function chatWithAi(message: string, focus: string, history: Array<{ role: 'user' | 'assistant'; content: string }>, onDelta: (delta: string) => void, signal?: AbortSignal): Promise<void> {
  const response = await authorizedApiFetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, focus, history }), signal })
  if (!response.ok) { const error = await response.json(); throw Error(error.message || 'AI 连接失败') }
  const reader = response.body?.getReader()
  if (!reader) throw Error('浏览器不支持流式回答')
  const decoder = new TextDecoder(); let buffer = '', done = false
  try { while (true) {
    const result = await reader.read(); if (result.done) break
    buffer += decoder.decode(result.value, { stream: true })
    const lines = buffer.split('\n'); buffer = lines.pop() || ''
    for (const line of lines) if (line.startsWith('data:')) {
      const item = JSON.parse(line.slice(5)) as { delta?: string; error?: string; done?: boolean }
      if (item.error) throw Error(item.error)
      if (item.delta) onDelta(item.delta)
      if (item.done) done = true
    }
  } if (!done) throw Error('回答连接中断，可重试') } finally { reader.releaseLock() }
}
