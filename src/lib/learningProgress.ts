import { getDb } from '../db/database'
import { authorizedApiFetch, getStoredUserId } from './sync'
import type { MediaItem } from './media'

export interface LearningPosition { revision: number; mutationId?: string; readingPosition?: { chapter: number; paragraph: number }; playbackPosition?: number; lastStudiedAt?: string }
export interface LearningRecord { id: string; title: string; kind: MediaItem['kind']; position: LearningPosition; pending?: boolean; conflict?: LearningPosition }
type Records = Record<string, LearningRecord>
const keyFor = (uid: string) => `learning-progress:${uid}`
const notify = () => window.dispatchEvent(new Event('ec-learning-progress'))
let writing: Promise<unknown> = Promise.resolve()
let retryTimer: number | undefined
let flushing: Promise<void> | undefined
async function records(uid: string): Promise<Records> { return (await (await getDb()).get('meta', keyFor(uid)))?.value as Records || {} }
function change(uid: string, fn: (value: Records) => void) {
  const task = writing.catch(() => undefined).then(async () => { const db = await getDb(), tx = db.transaction('meta', 'readwrite'); const value = (await tx.store.get(keyFor(uid)))?.value as Records || {}; fn(value); await tx.store.put({ key: keyFor(uid), value }); await tx.done; notify() })
  writing = task
  return task
}
export async function recentLearning(): Promise<LearningRecord[]> {
  const uid = getStoredUserId()
  if (!uid) return []
  return Object.values(await records(uid)).sort((a,b) => (b.position.lastStudiedAt || '').localeCompare(a.position.lastStudiedAt || '')).slice(0, 5)
}
export async function mergeLearning<T extends MediaItem>(item: T): Promise<T> {
  const uid = getStoredUserId(), saved = uid ? (await records(uid))[item.id] : undefined
  if (uid && item.lastStudiedAt && !saved?.pending && (!saved || (item.revision || 0) > saved.position.revision)) {
    await change(uid, all => { if (!all[item.id]?.pending) all[item.id] = { id: item.id, title: item.title, kind: item.kind, position: { revision: item.revision || 0, readingPosition: item.readingPosition, playbackPosition: item.playbackPosition, lastStudiedAt: item.lastStudiedAt } } })
  }
  return saved && (saved.pending || saved.position.revision >= (item.revision || 0)) ? { ...item, ...saved.position } : item
}
export async function saveLearning(item: MediaItem, position: Partial<LearningPosition>) {
  const uid = getStoredUserId()
  if (!uid) return
  await change(uid, all => {
    const previous = all[item.id]
    all[item.id] = { id: item.id, title: item.title, kind: item.kind, position: { ...previous?.position, revision: previous?.position.revision ?? item.revision ?? 0, ...position, mutationId: crypto.randomUUID(), lastStudiedAt: new Date().toISOString() }, pending: true, conflict: previous?.conflict }
  })
  window.clearTimeout(retryTimer); retryTimer = window.setTimeout(() => { void flushLearning() }, 1000)
}
export function flushLearning(): Promise<void> {
  if (flushing) return flushing
  const uid = getStoredUserId()
  if (!uid || !navigator.onLine) return Promise.resolve()
  const run = async () => {
    for (const record of Object.values(await records(uid))) {
      if (!record.pending || record.conflict || uid !== getStoredUserId()) continue
      const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), 10000)
      try {
        const response = await authorizedApiFetch(`/api/media/${record.id}/progress`, { method: 'PATCH', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record.position) })
        const result = await response.json() as { progress?: LearningPosition }
        if (uid !== getStoredUserId() || !result.progress || (!response.ok && response.status !== 409)) continue
        await change(uid, all => {
          const current = all[record.id]
          if (!current) return
          if (response.status === 409) { current.conflict = result.progress; return }
          if (current.position.mutationId === record.position.mutationId) { current.position = result.progress!; current.pending = false }
          else current.position.revision = result.progress!.revision
        })
      } catch { /* Keep the durable pending record for the next retry. */ }
      finally { window.clearTimeout(timer) }
    }
  }
  flushing = run().catch(() => undefined).finally(() => { flushing = undefined })
  return flushing
}
export async function resolveLearning(id: string, useLocal: boolean) {
  const uid = getStoredUserId()
  if (!uid) return
  await change(uid, all => { const record = all[id]; if (!record?.conflict) return; record.position = useLocal ? { ...record.position, revision: record.conflict.revision } : record.conflict; record.pending = useLocal; delete record.conflict })
  await flushLearning()
}
