import { authorizedApiFetch } from './sync'
export interface DailyProfile { level: string; minutes: number; interests: string }
export interface DailyContext {
  focus: Array<{ id: string; text: string; context: string; familiarity: string; meaningZh: string[] }>
  source: { id: string; title: string; level: string; excerpt: string; origin: { materialId: string; chapter?: number; paragraph?: number; timestamp?: number } } | null
  shadowQuote: string
  entryCount: number
  choices?: Array<{ id: string; title: string; level: string }>
}
export interface DailySession {
  id: string; date: string; profile: DailyProfile; context: DailyContext
  plan: { titleZh: string; reasonZh: string; practiceTextEn: string; englishMeanings: Array<{ text: string; meaningEn: string; exampleEn: string }>; gistQuestionEn: string; retellPromptEn: string; situationZh: string; openingQuestionEn: string; selfTalkPromptEn: string; helpZh: string }
  completed: string[]; turns: Array<{ role: 'user' | 'assistant'; content: string }>; rating: string; reflection: string; retelling: string; updatedAt: string
}
export interface DailyOverview { profile: DailyProfile; context: DailyContext; history: Array<{ id: string; date: string; title: string; level: string; minutes: number; completed: string[]; rating: string }> }
async function dailyRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), path.endsWith('/plan') ? 65000 : 12000)
  try { const response = await authorizedApiFetch(path, { ...init, signal: controller.signal }); const data = await response.json(); if (!response.ok) throw Error(data.message || '练习暂时无法读取'); return data }
  catch (error) { if (controller.signal.aborted) throw Error('连接超时，已有练习仍保留，可稍后重试'); throw error }
  finally { window.clearTimeout(timer) }
}
export const getDailyOverview = (materialId = '') => dailyRequest<DailyOverview>('/api/ai/daily' + (materialId ? '?materialId=' + encodeURIComponent(materialId) : ''))
export const getDailySession = (id: string) => dailyRequest<{ session: DailySession }>('/api/ai/daily/session/' + encodeURIComponent(id))
export const generateDaily = (profile: DailyProfile, date: string, materialId: string) => dailyRequest<{ session: DailySession }>('/api/ai/daily/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, date, materialId }) })
export const saveDailyProgress = (session: DailySession) => dailyRequest<{ session: DailySession }>('/api/ai/daily/session/' + encodeURIComponent(session.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: session.completed, rating: session.rating, reflection: session.reflection, retelling: session.retelling }) })
