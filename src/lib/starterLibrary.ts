import { getDb } from '../db/database'
import { getStoredUserId } from './sync'
import type { MaterialCollection, MediaItem } from './media'

export interface StarterItem { id: string; title: string; titleZh: string; provider: string; sourceUrl: string; audio: string; durationSeconds: number; lines: Array<{ text: string }> }
export const ELLLO_COLLECTION: MaterialCollection = { id: 'elllo-starter', title: 'ELLLO', library: 'audio', category: '短篇对话', purposes: ['日常对话'] }
interface StarterPosition { playbackPosition: number; lastStudiedAt: string }
export async function readStarterPositions(): Promise<Record<string, StarterPosition>> { return (await (await getDb()).get('meta', 'starter-progress:' + (getStoredUserId() || 'local')))?.value as Record<string, StarterPosition> || {} }
export async function saveStarterPosition(id: string, playbackPosition: number) {
  const key = 'starter-progress:' + (getStoredUserId() || 'local'), db = await getDb(), tx = db.transaction('meta', 'readwrite')
  const records = (await tx.store.get(key))?.value as Record<string, StarterPosition> || {}
  records[id] = { playbackPosition, lastStudiedAt: new Date().toISOString() }
  await tx.store.put({ key, value: records }); await tx.done
  return records[id]
}
export function starterMedia(item: StarterItem, position?: StarterPosition): MediaItem {
  const topics = /camera|reading|music/i.test(item.id) ? ['兴趣爱好'] : /favorite-place|weekend/i.test(item.id) ? ['出行旅行'] : ['日常生活']
  return { ...position, id: item.id, title: item.titleZh, kind: 'audio', source: 'ELLLO', transcript: item.lines.map(line => line.text).join('\n'), durationSeconds: item.durationSeconds, level: 'A2', levelBasis: '原内置素材参考等级', exercises: [], status: 'ready', bytes: 0, error: '', extension: 'mp3', streamUrl: null, createdAt: '', updatedAt: '', organization: { library: 'audio', category: ELLLO_COLLECTION.category, collectionId: ELLLO_COLLECTION.id, collectionTitle: ELLLO_COLLECTION.title, purposes: ELLLO_COLLECTION.purposes, inheritedPurposes: true, topics, sequence: 0, inferred: false } }
}
