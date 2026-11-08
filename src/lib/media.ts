import { authorizedApiFetch } from './sync'
import type { BookChapter } from './books'
export interface TimedWord { start: number; end: number; text: string }
export interface TimedSegment { start: number; end: number; text: string; translation?: string; words?: TimedWord[] }

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
  kind: 'audio' | 'video' | 'text' | 'book' | 'link' | 'lesson'
  level?: string
  levelBasis?: string
  contentHash?: string
  author?: string
  chapters?: BookChapter[]
  readingPosition?: { chapter: number; paragraph: number }
  segments?: TimedSegment[]
  playbackPosition?: number
  courseId?: string
  episode?: number
  sourceUrl?: string
  lessonPage?: string
  translationSource?: string
  notes?: Array<{ id: string; text: string; at: number; quote: string; createdAt: string }>
  studyGuide?: { summary: string; goals: string[]; points: Array<{ title: string; explanation: string; example: string; start?: number; segmentIndex?: number }>; questions: Array<{ question: string; answer: string }> }
  guideStatus?: 'processing' | 'ready' | 'failed' | ''
  guideError?: string
  source: string
  transcript: string
  exercises: Exercise[]
  exerciseCount?: number
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
  const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), 12000)
  try { return (await request<{ items: MediaItem[] }>('/api/media', { signal: controller.signal })).items } finally { window.clearTimeout(timer) }
}

export async function getMedia(id: string): Promise<MediaItem> {
  const data = await request<{ item: MediaItem }>(`/api/media/${id}`)
  return data.item
}
export async function patchMedia(id: string, changes: object): Promise<MediaItem> {
  return (await request<{ item: MediaItem }>(`/api/media/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) })).item
}

export async function uploadMedia(input: { title: string; source: string; transcript: string; kind: MediaItem['kind']; file?: File; level?: string; levelBasis?: string; contentHash?: string; sourceUrl?: string; chapters?: BookChapter[]; author?: string; segments?: MediaItem['segments'] }): Promise<MediaItem> {
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

export async function processMedia(id: string, transcribe = false): Promise<MediaItem> {
  const data = await request<{ item: MediaItem }>(`/api/media/${id}/process`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcribe }) })
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
  await aiSettingsRequest('/api/ai/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey, provider }) })
}

export async function deleteAiKey(provider = 'openai'): Promise<void> {
  await aiSettingsRequest(`/api/ai/key?provider=${provider}`, { method: 'DELETE' })
}
export async function deepseekConfigured(): Promise<boolean> { return (await request<{ deepseekConfigured: boolean }>('/api/ai/status')).deepseekConfigured }
export type AiProvider = 'deepseek' | 'gemini'
export interface AiServiceSettings { networkMode: 'auto' | 'direct' | 'proxy'; baseUrl: string; model: string; thinking: 'default' | 'disabled' | 'enabled'; reasoningEffort: 'default' | 'low' | 'medium' | 'high' }
export interface AiStatus { configured: boolean; deepseekConfigured: boolean; geminiConfigured: boolean; assistantProvider: AiProvider; assistantConfigured: boolean; chatProvider: string; model: string; services: Record<AiProvider, AiServiceSettings & { configured: boolean; route: 'proxy' | 'direct'; proxyAvailable: boolean; proxyLabel: string }>; presets: Record<AiProvider, AiServiceSettings> }
async function aiSettingsRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), ['/api/ai/test', '/api/ai/models'].includes(path) ? 20000 : 12000)
  try { return await request<T>(path, { ...init, signal: controller.signal }) }
  catch (error) { if (controller.signal.aborted) throw Error('连接超时，操作结果未确认；请重新读取状态后重试'); if (error instanceof TypeError) throw Error('无法连接 NAS，请检查网络后重试'); if (error instanceof SyntaxError) throw Error('NAS 返回异常，请刷新页面后重试'); throw error }
  finally { window.clearTimeout(timer) }
}
export const getAiStatus = () => aiSettingsRequest<AiStatus>('/api/ai/status')
export const saveAiSettings = (provider: AiProvider, settings: AiServiceSettings, apiKey: string) => aiSettingsRequest<{ settings: AiServiceSettings & { configured: boolean } }>('/api/ai/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, ...settings, ...(apiKey ? { apiKey } : {}) }) })
export const getAiModels = (provider: AiProvider) => aiSettingsRequest<{ models: string[] }>('/api/ai/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }) })
export const testAiConnection = (provider: AiProvider) => aiSettingsRequest<{ result: { model: string; latencyMs: number } }>('/api/ai/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }) })
export const chooseAiProvider = (provider: AiProvider) => aiSettingsRequest('/api/ai/provider', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }) })
export async function explainWithAi(text: string, context: string, source: string, signal?: AbortSignal) {
  return (await request<{ explanation: { definitionsZh: string[]; note: string; uncertain: boolean; provider: 'deepseek' | 'gemini' } }>('/api/ai/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, context, source }), signal })).explanation
}

export async function chatWithAi(message: string, focus: string, history: Array<{ role: 'user' | 'assistant'; content: string }>, onDelta: (delta: string) => void, signal?: AbortSignal, dailySessionId?: string): Promise<void> {
  const response = await authorizedApiFetch(dailySessionId ? '/api/ai/daily/chat' : '/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dailySessionId ? { message, sessionId: dailySessionId } : { message, focus, history }), signal })
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
